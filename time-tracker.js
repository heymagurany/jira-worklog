const _ = require('lodash');
const moment = require('moment');
const Promise = require('bluebird');
const request = require('request-promise');

const fromTime = moment(process.argv[2]);
const toTime = moment(process.argv[3]);
const workingSeconds = parseInt(process.argv[4]) * 28800;

if (process.argv.length < 5 || !fromTime.isValid() || !toTime.isValid() || isNaN(workingSeconds)) {
  console.log("usage: jira2inin <start-date> <end-date> <working-days>");
  return;
}

const baseUrl = 'https://inindca.atlassian.net/rest/api/2/';
const username = 'heymagurany';
const options = {
  auth: {
    user: username,
    pass: ''
  },
  json: true,
  headers: {
    'Accept': 'application/json'
  }
};
const epicIssueTypeId = '6';
const epicFieldName = 'customfield_10300';

function get(path) {
  return request(_.assign(options, {
    method: 'GET',
    url: baseUrl + path
  }));
}

function post(path, body) {
  return request(_.assign(options, {
    method: 'POST',
    url: baseUrl + path,
    body: body
  }));
}

function aggregateWorkLogs(worklogs, totalTime) {
  return _(worklogs)
        .filter(worklog => worklog.author.name === username)
        .filter(worklog => moment(worklog.started).isBetween(fromTime, toTime))
        .map(worklog => worklog.timeSpentSeconds)
        .reduce(_.add, totalTime);
}

function getWorkLog(issues, epicMap, epicKey) {
  if (issues) {
    return Promise.each(issues, issue => {
      epicKey = issue.fields[epicFieldName] || epicKey;

      if (epicKey) {
        var worklog = issue.fields.worklog;

        if (worklog) {
          if (worklog.total > worklog.maxResults) {
            console.warn('Worklog does not contain all results.');
          }

          epicMap[epicKey] = aggregateWorkLogs(worklog.worklogs, epicMap[epicKey]);
        }
      }
      else {
        console.log(`MISS! ${issue.key}`);
      }

      return getWorkLog(issue.fields.subtasks, epicMap, epicKey);
    });
  }
}

var epicMap = {};

return post('search', {
  jql: `worklogAuthor = currentUser() AND worklogDate >= ${fromTime.format('YYYY-MM-DD')} AND worklogDate < ${toTime.format('YYYY-MM-DD')}`,
  startAt: 0,
  maxResults: 1000,
  fields: [
    epicFieldName,
    'subtasks',
    'worklog',
    'issuetype',
    'parent'
  ],
  expand: [
    'parent.' + epicFieldName
  ]
})
.then(storiesAndBugs => {
  console.log(storiesAndBugs.issues[0]);
  if (storiesAndBugs.total > storiesAndBugs.maxResults) {
    console.warn('Query result does not contain all results.');
  }

  var issuesWithEpic = _.filter(storiesAndBugs.issues, issue => issue.fields[epicFieldName]);
  var issuesWithoutEpic = _.filter(storiesAndBugs.issues, issue => !issue.fields[epicFieldName]);
  var epics = _.filter(issuesWithoutEpic, issue => issue.fields.issuetype.id === epicIssueTypeId);

  return getWorkLog(storiesAndBugs.issues, epicMap);

  // TODO: get work log for epics
  // TODO: get epic for sub-tasks
})
.then(() => {
  _.forIn(epicMap, (value, key) => {
    var secondsLogged = value;

    if (secondsLogged) {
      var percent = (secondsLogged / workingSeconds) * 100;

      console.log(`${key}: ${secondsLogged} ${percent.toFixed()}%`);
    }
  });
});
