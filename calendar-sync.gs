/***********************************************************************************
 * EQUINOX GOOGLE CALENDAR SYNC
 * ---
 * Author: Frank Harris (frank@hirefrank.com)
 * Initial Date: Aug 26, 2018
 * MIT License
 *
 * This script syncs the user's Equinox Calendar with their Google Calendar on 
 * an ongoing basis. It supports (at least) personal training sessions and 
 * group fitness classes.
 *
 * property name                  value
 * -------------                  -----
 * cookie                         the user's EqAuth.v1 equinox.com cookie
 * hours_frequency (optional)     triggers the sync every n hours (4)
 * days_in_advance (optional)     the # of days in the future to sync (45)
 * calendar (optional)            the name of the calendar (user's default)
 *
 * Instructions:
 * 1. Create a new Google App Script (https://script.google.com/home/my) project 
 *    with the contents of this script.
 * 2. Create cookie property and any other desired properties from above. 
 *    (File > Project properties > Script properties)
 * 3. Run the setup function. (Run > Run function > setup)
 * 
 * More info:
 * https://github.com/hirefrank/equinox-google-calendar-sync/blob/master/README.md
 ***********************************************************************************/

/**
 * Sets up the time-based trigger and runs the initial sync.
 * ---
 * By default it runs every 4 hours. If you want to override that setting
 * create a script property named 'hours_frequency' and set the value to be n to 
 * trigger every n hours.
 *
 * This should only be run once. Running it more frequently will create multiple
 * triggers. To see the project's triggers: Edit > Current project's triggers
 */

function setup() {
  // if no property override, use the default: every 4 hours
  const HOURS_FREQUENCY = PropertiesService.getScriptProperties().getProperty('hours_frequency') || 4;
  
  // create the trigger
  ScriptApp.newTrigger("calendarSync").timeBased().everyHours(HOURS_FREQUENCY).create();
  
  // run the initial sync
  calendarSync();
}

/**
 * Main function that intiates the sync.
 * ---
 * By default it syncs the calendars 45 days in advance. If you want to override 
 * that setting create a script property named 'days_in_advance' and set the value 
 * to be the number of days.
 */

function calendarSync() {
  // if no property override, use the default: 45 days
  const DAYS_IN_ADVANCE = PropertiesService.getScriptProperties().getProperty('days_in_advance') || 45;
  
  // create a footer to append to all events
  // this makes it easier to search and find all the events created
  var script_url = 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/edit';
  var footer = '\n\n---\n<a href="' + script_url + '">Equinox Google Calendar Sync</a>';
  
  // create date ranges
  var from_date = new Date();
  var to_date = new Date();
  to_date.setDate(to_date.getDate() + DAYS_IN_ADVANCE);
  
  // pass the parameters and run the delete events function
  deleteEvents(from_date, to_date, footer);
  
  // 5s pause to prevent the functions running synchronously 
  Utilities.sleep(5000);
  
  // pass the parameters and run the add events function
  addEvents(from_date, to_date, footer);
}

/*
 * Adds all events from the Equinox Calendar to Google Calendar
 */

function addEvents(from_date, to_date, footer) {
  // contruct the api endpoint
  var url = '/v3/me/calendar/?fromDate=' + formatDate(from_date) + '&toDate=' + formatDate(to_date);  
  var json_data = JSON.parse(apiFetch(url, 'get'));
  
  // for each event
  for (e in json_data.events) {
    var e = json_data.events[e];
    
    // convert strings to date objects
    var start = new Date(e.startDate);
    var end = new Date(e.endDate);
    
    // event timestamp must be in the future
    // this avoids adding an event from earlier in the day
    if (start >= new Date()) {
      var instructor_first_name;
      var instructor_last_name;
      
      // construct the instructor name; there are a few variations
      // trainer: personal training
      // instructor: group fitness
      // substitute: substitute for instructor (group fitness)
      if (e.trainerFirstName === undefined) {
        if (e.instructors[0].substitute == null) {
          // only grabbing the first instructor if there are multiples
          instructor_first_name = e.instructors[0].instructor.firstName;
          instructor_last_name = e.instructors[0].instructor.lastName;
        } else {
          instructor_first_name = e.instructors[0].substitute.firstName;
          instructor_last_name = e.instructors[0].substitute.lastName;        
        }
      } else {
        instructor_first_name = e.trainerFirstName;
        instructor_last_name = e.trainerLastName; 
      }
      
      // construct the event name, location, description fields
      var name = e.name + ' with ' + instructor_first_name + ' ' + instructor_last_name;
      var location = 'Equinox ' + e.facilityName;
      var description = footer;
      
      // prepend name and description fields if applicable
      // if status exist, it's an event with a reservation
      if (e.status !== undefined) {
        // if localId exists, equipment (treadmill, bike, etc) has been reserved for the class
        // add it to the description
        if (e.status !== null && 'localId' in e.status) description = e.status['gridItemType'] + ' #' +  e.status['localId'] + description;
      
      // if classInstanceId exist, it's an event that requires a reservation
      } else if (e.classInstanceId !== undefined) {        
        // get class details to determine when resservations open
        var d = JSON.parse(classDetails(e.classInstanceId.toFixed(0)));
        var bt = new Date(d.status['reservationStartDate']).toLocaleString();
        
        // update the event name and description to reflect the class requires a resservation
        if (d.status !== undefined && d.status['hasReservation'] == false) name = '[HOLD] ' + name;
        description = 'This class requires a reservation. Reservations open on ' + bt + '.' + description;
      }
      
      // add the event to the calendar and log it
      var event = getCalendar().createEvent(name, start, end,{location: location, description: description});
      console.log('Added Event Id: ' + event.getId());
      // 1s pause to throttle api calls
      Utilities.sleep(1000);
    }
  }
}

/**
 * Deletes all future events on Google Calendar synced from the Equinox Calendar
 */

function deleteEvents(from_date, to_date, footer) {
  // retrieve all events that includes the footer message
  var events = getCalendar().getEvents(from_date, to_date, {search: footer.replace(/(<([^>]+)>)/ig,'')});
  for (e in events) {
    // delete each event and log it
    events[e].deleteEvent();
    console.log('Deleted Event Id: ' + events[e].getId());
    // 1s pause to throttle api calls
    Utilities.sleep(1000);
  }
}

/**
 * Returns the user's calendar object
 * ---
 * By default it uses the user's default calendar. If you want to override that 
 * setting create a script property named 'calendar' and set the value to be the 
 * calendar's name.
 */

function getCalendar() {
  const CALENDAR = PropertiesService.getScriptProperties().getProperty('calendar') || null;
  
  if (CALENDAR == null) {
    return CalendarApp.getDefaultCalendar();
  } else {
    return CalendarApp.getCalendarsByName(CALENDAR);
  }
}

/**
 * Returns the class's metadata
 */

function classDetails(class_id){ 
  var url = '/v3/classes/' + class_id;
  return apiFetch(url, 'get'); 
}

/**
 * Makes an authenticated Equinox API and returns the response
 * ---
 * Accepts API endpoint, method, and form data (optional). Requires a script 
 * property named 'cookie' with the value of the user's EqAuth.v1 equinox.com cookie.
 */

function apiFetch(api, method, form) {
  const COOKIE = PropertiesService.getScriptProperties().getProperty('cookie');
  const API_BASE_URL = 'https://api.equinox.com';
  
  // not all api calls have form data
  // if not passed in, set to empty
  var form = form || '';
  // assemble the header
  // spoof user-agent, origin, referer
  var headers = {                                                              
    'Cookie': COOKIE,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.106 Safari/537.36',
    'Origin': 'https://www.equinox.com',
    'Referer': 'https://www.equinox.com/activity'
  };
  
  // assembles the options
  // sets the headers, form data, method
  var parameters = {                                                                                                                
    'headers': headers,                                                        
    'payload': form,                                           
    'method': method,                                                          
    'muteHttpExceptions': true,
  };
  
  // constructs the url, makes the api call, returns the response
  var url = API_BASE_URL + api;
  var response = UrlFetchApp.fetch(url, parameters);   
  
  return response;
}

/**
 * Returns the date in an Equinox friendly format, e.g. YYYY-MM-DD
 */

function formatDate(date) {
  var d = new Date(date),
  month = '' + (d.getMonth() + 1),
  day = '' + d.getDate(),
  year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
}