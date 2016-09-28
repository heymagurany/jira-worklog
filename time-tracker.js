const _ = require('lodash');
const moment = require('moment');
const Promise = require('bluebird');
const request = require('request-promise');

const fromTime = moment(process.argv[2]);
const toTime = moment(process.argv[3]);
const workingDuration = moment.duration({
  days: process.argv[4]
});

if (process.argv.length < 5 || !fromTime.isValid() || !toTime.isValid() || isNaN(workingDuration.asDays())) {
  console.log("usage: jira2inin <start-date> <end-date> <working-days>");
  return;
}

const workingSeconds = workingDuration.asDays() * 28800;
const baseUrl = 'https://inindca.atlassian.net/rest/api/2/';
const username = 'heymagurany';
const options = {
  auth: {
    user: username,
    pass: 'ydYFB4Zp842yF7cJkMFgiZwRA})NVu'
  },
  json: true,
  headers: {
    'Accept': 'application/json'
  }
};
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

function aggregateWorkLogs(worklogs) {
  return _(worklogs)
        .filter(worklog => worklog.author.name === username)
        .filter(worklog => moment(worklog.started).isBetween(fromTime, toTime))
        .map(worklog => worklog.timeSpentSeconds)
        .reduce(_.add, 0)
}

function getWorkLog(issues, epicMap, epicKey, whitespace) {
  if (issues) {
    return Promise.each(issues, issue => {
      epicKey = issue.fields[epicFieldName] || epicKey;

      if (epicKey) {
        var worklog = issue.fields.worklog;

        if (worklog) {
          if (worklog.total > worklog.maxResults) {
            console.warn('Worklog does not contain all results.');
          }

          var timeSpent = aggregateWorkLogs(worklog.worklogs);
          var duration = moment.duration({
            seconds: timeSpent
          });

          if (epicMap[epicKey]) {
            epicMap[epicKey].add(duration);
          }
          else {
            epicMap[epicKey] = duration;
          }

          // console.log(`${whitespace}${issue.key}: ${epicKey}, ${duration}`);
        }
      }

      return getWorkLog(issue.fields.subtasks, epicMap, epicKey, whitespace + '  ');
    });
  }
}

var epicMap = {};

return post('search', {
  jql: `project = SUPP AND issuetype in (Bug, Story)`,
  startAt: 0,
  maxResults: 1000,
  fields: [
    epicFieldName,
    'subtasks',
    'worklog'
  ]
})
.then(storiesAndBugs => {
  if (storiesAndBugs.total > storiesAndBugs.maxResults) {
    console.warn('Query result does not contain all results.');
  }

  return getWorkLog(storiesAndBugs.issues, epicMap, null, '');
})
.then(() => {
  _.forIn(epicMap, (value, key) => {
    var secondsLogged = value.asSeconds();

    if (secondsLogged) {
      var percent = (secondsLogged / workingSeconds) * 100;

      console.log(`${key}: ${percent.toFixed(2)}%`);
    }
  });
});
