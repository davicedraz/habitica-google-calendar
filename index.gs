const CALENDAR_NAME = "Your calendar name goes here";
const HABITICA_TOKEN = "Your habitica token goes here";
const HABITICA_ID = "Your habitica id goes here";

function syncToHabbitica() {
  const habTaskURL = "https://habitica.com/api/v3/tasks/";

  const today = new Date();
  const agenda = CalendarApp.getCalendarsByName(CALENDAR_NAME)[0];
  const events = agenda.getEventsForDay(today);

  console.log(events[0]);

  const templateParams = {
    _post: {
      method: "post",
      headers: { "x-api-user": HABITICA_ID, "x-api-key": HABITICA_TOKEN },
    },
    _get: {
      contentType: "application/json",
      method: "get",
      headers: { "x-api-user": HABITICA_ID, "x-api-key": HABITICA_TOKEN },
    },
    _delete: {
      method: "delete",
      headers: { "x-api-user": HABITICA_ID, "x-api-key": HABITICA_TOKEN },
    },
  };

  const newTasks = [];
  const existingTasks = fetchExistingTasks(habTaskURL, templateParams);
  const completedTasksContent = fetchTodayCompletedTasks(
    habTaskURL,
    templateParams,
    today
  );

  deleteCalendarTasks(habTaskURL, existingTasks, templateParams);

  for (i = 0; i < events.length; i++) {
    if (newTasks.indexOf(events[i].getTitle()) === -1) {
      newTasks.push(events[i].getTitle());

      const params = templateParams._post;
      params["payload"] = {
        text: ":calendar: " + events[i].getTitle(),
        notes: createTaskNote(events[i].getTitle(), events[i].getLocation()),
        type: "daily",
        priority: "2",
        date: "today",
        repeat: "false",
      };

      const paramsText = completedTasksContent.indexOf(params.payload.text);

      if (completedTasksContent.indexOf(params.payload.text) === -1) {
        UrlFetchApp.fetch(habTaskURL + "user", params);
      }
    }
  }
}

function fetchExistingTasks(habTaskURL, templateParams) {
  const response = UrlFetchApp.fetch(
    habTaskURL + "user?type=dailys",
    templateParams._get
  );
  return JSON.parse(response.getContentText());
}

function deleteCalendarTasks(habTaskURL, habTasks, templateParams) {
  for (j = 0; j < habTasks.data.length; j++) {
    if (habTasks.data[j].text.indexOf(":calendar: ") > -1) {
      UrlFetchApp.fetch(
        habTaskURL + habTasks.data[j].id,
        templateParams._delete
      );
    }
  }
}

function fetchTodayCompletedTasks(habTaskURL, templateParams, today) {
  const tasksContent = [];
  const response = UrlFetchApp.fetch(
    habTaskURL + "user?type=dailys",
    templateParams._get
  );
  const tasks = JSON.parse(response.getContentText());

  for (i = 0; i < tasks.data.length; i++) {
    if (tasks.data[i].text.indexOf(":calendar: ") > -1) {
      const taskDate = new Date(tasks.data[i].createdAt).getDate();
      if (taskDate + 12 !== today.getDate()) {
        tasksContent.push(tasks.data[i].text);
      }
    }
  }
  return tasksContent;
}

//optional call, remove if you dont't need it
function createTaskNote(title, location) { 
  if (location) {
    if (location.indexOf("Some recurrent event title you want to filter in") > -1) {
      return (
        location + "![image](some_valid_url)" //markdown sintax
      );
    } else if (title.indexOf("Another recurrent event title you want to filter in") > -1) {
      return location + "![image](some_valid_url)"; //markdown sintax
    } else {
      return location;
    }
  } else {
    return "";
  }
}
