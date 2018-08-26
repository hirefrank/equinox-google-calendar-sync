/* Do not edit below */

var SCRIPT_ID = ScriptApp.getScriptId();
var SCRIPT_URL = 'https://script.google.com/macros/d/' + SCRIPT_ID + '/edit';
var FOOTER = '\n\n---\n<a href="' + SCRIPT_URL + '">Equinox Google Calendar Sync</a>';
var API_BASE_URL = 'https://api.equinox.com';
var FROM_DATE = new Date();
var TO_DATE = new Date();

function main() {
  TO_DATE.setDate(TO_DATE.getDate() + DAYS_IN_ADVANCE);
  
  deleteEvents();
  Utilities.sleep(5000);
  addEvents();
}

function addEvents() {
  var url = '/v3/me/calendar/?fromDate=' + formatDate(FROM_DATE) + '&toDate=' + formatDate(TO_DATE);  
  var json_data = JSON.parse(apiFetch(url, 'get'));
  
  for (e in json_data.events) {
    var e = json_data.events[e];
        
    var instructor_first_name;
    var instructor_last_name;
    
    if (e.trainerFirstName === undefined) {
      if (e.instructors[0].substitute == null) {
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
    
    var name = e.name + ' with ' + instructor_first_name + ' ' + instructor_last_name;
    var start = new Date(e.startDate);
    var end = new Date(e.endDate);
    var location = 'Equinox ' + e.facilityName;
    var description = FOOTER;
    
    if (e.status !== undefined) {
      if (e.status !== null && 'localId' in e.status) description = e.status['gridItemType'] + ' #' +  e.status['localId'] + description;
    } 
    
    if (e.classInstanceId !== undefined) {
      var d = JSON.parse(classDetails(e.classInstanceId.toFixed(0)));
      if (d.status !== undefined && d.status['hasReservation'] == false) name = '[HOLD] ' + name;
    }
    
    var event = CalendarApp.getDefaultCalendar().createEvent(name, start, end,{location: location, description: description});
    console.log('Added Event Id: ' + event.getId());
  }
}

function classDetails(class_id){ 
  var url = '/v3/classes/' + class_id;
  return apiFetch(url, 'get'); 
}

function deleteEvents() {
  var events = CalendarApp.getDefaultCalendar().getEvents(FROM_DATE, TO_DATE, {search: FOOTER.replace(/(<([^>]+)>)/ig,'')});
  for (e in events) {
    events[e].deleteEvent();
    console.log('Deleted Event Id: ' + events[e].getId());
    Utilities.sleep(1000);
  }
}

function apiFetch(api, method, form) {
  var form = form || '';
  var headers = {                                                              
    'Cookie': COOKIE,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.106 Safari/537.36',
    'Origin': 'https://www.equinox.com',
    'Referer': 'https://www.equinox.com/activity'
  };
  
  var parameters = {                                                                                                                
    'headers': headers,                                                        
    'payload': form,                                           
    'method': method,                                                          
    'muteHttpExceptions': true,
  };
  
  var url = API_BASE_URL + api;
  var response = UrlFetchApp.fetch(url, parameters);   
  
  return response;
}

function formatDate(date) {
  var d = new Date(date),
  month = '' + (d.getMonth() + 1),
  day = '' + d.getDate(),
  year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
}
