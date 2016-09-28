const _ = require('lodash');
const moment = require('moment');
const Promise = require('bluebird');
const request = require('request-promise');

const fromTime = moment(process.argv[2]);
const toTime = moment(process.argv[3]);
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

      return get(`issue/${issue.key}/worklog`)
      .then(result => aggregateWorkLogs(result.worklogs))
      .then(timeSpent => {
        if (epicKey) {
          var duration = moment.duration({
            seconds: timeSpent
          });

          if (epicMap[epicKey]) {
            epicMap[epicKey].add(duration);
          }
          else {
            epicMap[epicKey] = duration;
          }
        }

        console.log(`${whitespace}${issue.key}: ${epicKey}, ${duration}`);

        return getWorkLog(issue.fields.subtasks, epicMap, epicKey, whitespace + '  ');  
      });
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
    'subtasks'
  ]
})
.then(storiesAndBugs => getWorkLog(storiesAndBugs.issues, epicMap, null, ''))
.then(() => {
  console.log(epicMap);
  _.forIn(epicMap, (value, key) => {
    console.log(`${key}: ${value.asSeconds()}`);
  });
});
