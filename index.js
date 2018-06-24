'use strict';
const influx = require('influx');
const http = require('https');
const moment = require('moment');
const fs = require('fs');

// Input parameters
let configFile = "./config.json";
let config = {};

// Check if a config file was specified
if (process.argv.length > 2) {
    configFile = process.argv[2];
}

// Read the config file if it exists
if(fs.existsSync(configFile)){
    console.log("Loading config file: " + configFile);
    config = require(configFile);
}
else{
    console.log("Config file not found, depending on environment variables");
}

// Read environment variables
// Poor man's config setup
config.uptimerobot = config.uptimerobot || {};
config.influx = config.influx || {};
if(process.env.UPTIMEROBOT_API_KEY !== undefined) {
    config.uptimerobot.apikey = process.env.UPTIMEROBOT_API_KEY;
}
if(process.env.UPTIMEROBOT_LOGS_LIMIT !== undefined) {
    config.uptimerobot.logs_limit = process.env.UPTIMEROBOT_LOGS_LIMIT;
}
if(process.env.UPTIMEROBOT_RESPONSE_TIMES_LIMIT !== undefined) {
    config.uptimerobot.apikey = process.env.UPTIMEROBOT_RESPONSE_TIMES_LIMIT;
}
if(process.env.INFLUXDB_HOST !== undefined) {
    config.influxdb.host = process.env.INFLUXDB_HOST;
}
if(process.env.INFLUXDB_PORT !== undefined) {
    config.influxdb.port = process.env.INFLUXDB_PORT;
}
if(process.env.INFLUXDB_PROTOCOL !== undefined) {
    config.influxdb.protocol = process.env.INFLUXDB_PROTOCOL;
}
if(process.env.INFLUXDB_USERNAME !== undefined) {
    config.influxdb.username = process.env.INFLUXDB_USERNAME;
}
if(process.env.INFLUXDB_PASSWORD !== undefined) {
    config.influxdb.password = process.env.INFLUXDB_PASSWORD;
}
if(process.env.INFLUXDB_DATABASE !== undefined) {
    config.influxdb.database = process.env.INFLUXDB_DATABASE;
}

const influxdb = influx(config.influx);


/**
 * Gets the monitor data
 * @returns {Promise<any>}
 */
function getMonitors() {
    return new Promise((resolve, reject)=>{
        const options = {
            hostname: 'api.uptimerobot.com',
            port: 443,
            path: '/v2/getMonitors',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const postData = {
            response_times: "1",
            response_times_limit: config.uptimerobot.response_times_limit,
            timezone: "1",
            format: "json",
            logs: "1",
            logs_limit: config.uptimerobot.logs_limit,
            api_key: config.uptimerobot.apikey
        };

        const req = http.request(options, (response) => {
            let objectString = "";
            response.on('data', (chunk) => {
                objectString += chunk;
            });

            response.on('end', () => {
                const responseData = JSON.parse(objectString);
                resolve(responseData.monitors);
            });
        });
        req.write(JSON.stringify(postData));
        req.end();
    });

}

function processMonitors(monitors){
    monitors.forEach((monitor) => {

        /*********************************************************************
         *  Response times
         ********************************************************************/
        const responseTimes = monitor.response_times;
        const responseTimePoints = [];
        responseTimes.forEach(function(rt) {
            const point = [];
            const timestamp = moment.unix(rt.datetime);

            // The value
            point[0] = {value : rt.value, time: timestamp.valueOf()};

            // The tags
            point[1] = {
                id : monitor.id,
                friendlyname: monitor.friendly_name
            };

            responseTimePoints.push(point);
        });

        // Now lets write this server's points
        influxdb.writePoints("responseTime", responseTimePoints, function(err, response) {
            if (err) {
                console.log(err);
            }
            if (response) {
                console.log(response);
            }
        });

        /*********************************************************************
         *  Monitor logs
         ********************************************************************/
        const logs = monitor.logs;
        const logTimePoints = [];

        logs.forEach((log) => {
            const point = [];
            const timestamp = moment.unix(log.datetime);

            // The value
            point[0] = {
                type : log.type,
                time: timestamp.valueOf(),
                reason: (log.reason.code === undefined || log.reason.code == null) ? "" : "" + log.reason.code,
                reason_detail: (log.reason.detail === undefined || log.reason.detail == null) ? "" : log.reason.detail
            };

            // The tags
            point[1] = {
                id : monitor.id,
                friendlyname: monitor.friendly_name
            };

            logTimePoints.push(point);
        });

        logTimePoints.forEach((log) => {
            console.log(JSON.stringify(log));
        });

        //Now lets write this server's points
        influxdb.writePoints("logs", logTimePoints, (err, response) => {
            if (err) {
                console.log(err);
            }
            if (response) {
                console.log(response);
            }
        });
    });

}

getMonitors()
    .then(processMonitors);
