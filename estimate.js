#!/usr/bin/env node
const axios = require('axios')
const inquirer = require('inquirer')
const ora = require('ora')
const winston = require('winston')

var spinner = ora();

var program = require('commander');

var ProgressBar = require('ascii-progress');

program
  .version('1.0.0', '-v, --version')
  .description('Set and Get estimates on Toggl projects')
program.parse(process.argv);

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: {service: 'user-service'},
    transports: [
        //
        // - Write to all logs with level `info` and below to `combined.log` 
        // - Write all logs error (and below) to `error.log`.
        //
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});