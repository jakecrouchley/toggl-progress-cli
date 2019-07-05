#!/usr/bin/env node

/* eslint-disable no-console */
const axios = require('axios');
const inquirer = require('inquirer');
const ora = require('ora');
const winston = require('winston');
const fs = require('fs');
const homedir = require('os').homedir();
const path = require('path');


const spinner = ora();

const program = require('commander');

const ProgressBar = require('ascii-progress');

program
    .version('1.0.0', '-v, --version')
    .description('View progress on Toggl projects');

program.parse(process.argv);

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: {
        service: 'user-service'
    },
    transports: [
        //
        // - Write to all logs with level `info` and below to `combined.log`
        // - Write all logs error (and below) to `error.log`.
        //
        new winston.transports.File({
            filename: 'error.log',
            level: 'error'
        }),
        new winston.transports.File({
            filename: 'combined.log'
        }),
    ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }));
}

const hostname = process.argv[2] === 'dev' ? 'http://localhost:3000' : 'https://toggl-progress.herokuapp.com';
const localFsDirName = '.progress';
const configDir = path.normalize(`${homedir}/${localFsDirName}`);
let togglApiKey;

function getApiKey() {
    return new Promise((resolve, reject) => {
        fs.readFile(`${configDir}/config.json`, (error, data) => {
            if (error) {
                reject(error);
            } else {
                // File exists
                const config = JSON.parse(data);
                togglApiKey = config.api_key;
                resolve(togglApiKey);
            }
        });
    });
}

function saveConfig(config) {
    return new Promise((resolve, reject) => {
        fs.mkdir(configDir, (fsMakeError) => {
            if (fsMakeError && fsMakeError.code !== 'EEXIST') {
                logger.error(fsMakeError);
                reject(fsMakeError);
            } else {
                fs.writeFile(`${configDir}/config.json`, JSON.stringify(config), {
                    recursive: true
                }, (fsWriteError) => {
                    if (fsWriteError) {
                        logger.error(fsWriteError);
                        reject(fsWriteError);
                    } else {
                        resolve();
                    }
                });
            }
        });
    });
}

function getWorkspace() {
    spinner.start('Loading Workspaces');
    return new Promise((resolve, reject) => {
        axios({
            method: 'get',
            url: `${hostname}/workspaces`,
            headers: {
                'content-type': 'application/json',
                'access-key': togglApiKey,
            },
        }).then((response) => {
            spinner.succeed('Loaded Workspaces');
            const workspaces = response.data;
            const choices = workspaces.map(workspace => ({
                name: workspace.name,
                value: workspace.id,
            }));
            const questions = [{
                type: 'list',
                name: 'workspace',
                choices,
                message: 'Please select a Workspace',
            }, ];
            inquirer.prompt(questions).then((answers) => {
                const workspaceId = answers.workspace;
                resolve(workspaceId);
            });
        }).catch((error) => {
            reject(error);
        });
    });
}

function getClient(clientId, clientName, workspaceId, startDate) {
    spinner.start(`Loading info for ${clientName}`);
    return new Promise((resolve, reject) => {
        axios({
            method: 'get',
            url: `${hostname}/workspace/${workspaceId}/client/${clientId}`,
            params: {
                start_date: startDate,
            },
            headers: {
                'content-type': 'application/json',
                'access-key': togglApiKey,
            },
        }).then((response) => {
            spinner.stop(`Loaded info for ${clientName}`);
            const client = response.data;
            resolve(client);
        }).catch((error) => {
            spinner.fail(`Failed to load info for ${clientName}`);
            logger.error(error);
            reject(error);
        });
    });
}

function getClients(workspaceId, startDate) {
    spinner.start('Loading Clients');
    return new Promise((resolve, reject) => {
        axios({
            method: 'get',
            url: `${hostname}/clients/${workspaceId}`,
            headers: {
                'content-type': 'application/json',
                'access-key': togglApiKey,
            },
        }).then((response) => {
            spinner.succeed('Loaded Clients');
            const clients = response.data;
            const choices = clients.map(client => ({
                name: client.name,
                value: {
                    name: client.name,
                    id: client.id,
                },
            }));
            const questions = [{
                type: 'list',
                name: 'selectedClient',
                choices,
                message: 'Please select a Client',
            }, ];
            inquirer.prompt(questions).then((answers) => {
                const {
                    selectedClient
                } = answers;
                getClient(selectedClient.id, selectedClient.name, workspaceId, startDate).then((client) => {
                    resolve(client);
                }).catch((error) => {
                    logger.error(error);
                    reject(error);
                });
            });
        }).catch((error) => {
            spinner.fail('Failed to load Clients');
            logger.error(error);
            reject(error);
        });
    });
}

function getProject(clientId, projectName) {
    spinner.start(`Loading info for ${projectName}`);
    return new Promise((resolve, reject) => {
        axios({
            method: 'get',
            url: `${hostname}/project`,
            params: {
                client_id: clientId,
                project_name: projectName,
            },
            headers: {
                'content-type': 'application/json',
            },
        }).then((response) => {
            spinner.stop(`Loaded info for ${projectName}`);
            const project = response.data;
            resolve(project);
        }).catch((error) => {
            spinner.fail(`Failed to load info for ${projectName}`);
            logger.error(error);
            reject(error);
        });
    });
}

function updateProject(clientId, projectName) {
    return new Promise((resolve, reject) => {
        const questions = [{
                type: 'input',
                name: 'estimate',
                message: 'Please enter an estimate in number of hours',
            },
            {
                type: 'input',
                name: 'rate',
                message: 'Please enter an hourly rate in dollars',
            },
        ];
        inquirer.prompt(questions).then((answers) => {
            spinner.start(`Saving info for ${projectName}`);
            axios({
                method: 'PATCH',
                url: `${hostname}/project`,
                data: {
                    client_id: clientId,
                    project_name: projectName,
                    estimate: answers.estimate,
                    rate: answers.rate,
                },
                headers: {
                    'content-type': 'application/json',
                },
            }).then((response) => {
                spinner.stop(`Saved info for ${projectName}`);
                const project = response.data;
                resolve(project);
            }).catch((error) => {
                spinner.fail(`Failed to save info for ${projectName}`);
                logger.error(error);
                reject(error);
            });
        });
    });
}

function promptProjects(client) {
    const choices = client.projects.map(project => project.name);
    const questions = [{
        type: 'list',
        name: 'selectedProject',
        choices,
        message: 'Please select a Project',
    }, ];
    inquirer.prompt(questions).then((answers) => {
        const {
            selectedProject
        } = answers;
        getProject(client.id, selectedProject).then((project) => {
            if (!project.estimate) {
                const estimateQuestion = [{
                    type: 'confirm',
                    name: 'add_estimate',
                    message: 'No estimate found, would you like to set one?',
                }, ];
                inquirer.prompt(estimateQuestion).then((estimateAnswers) => {
                    if (estimateAnswers.add_estimate) {
                        updateProject(client.id, project.name).then((updatedProject) => {
                            showResults(client, updatedProject);
                        });
                    } else {
                        promptProjects(client);
                    }
                });
            } else {
                showResults(client, project);
            }
        }).catch((error) => {
            logger.error(error);
        })
    });
}

function showResults(client, project) {
    const togglProject = client.projects.find(value => value.name === project.name);
    const currentHours = (togglProject.effort / 1000 / 60 / 60);
    const percentage = (currentHours / project.estimate) * 100;
    const bar = new ProgressBar({
        schema: '╢:bar╟ :percent :current hrs/:total estimated ($:cost/$:price)\n',
        blank: '░',
        filled: '█',
        total: project.estimate,
    });
    bar.update(percentage / 100, {
        current: currentHours,
        cost: parseFloat(currentHours * project.rate).toFixed(0),
        price: parseFloat(project.estimate * project.rate).toFixed(0),
    });
    console.log('\n');
    const questions = [{
        type: 'confirm',
        name: 'again',
        message: 'Check another project?',
    }, ];
    inquirer.prompt(questions).then((answers) => {
        if (answers.again) {
            run();
        }
    });
}



const today = new Date();
today.setFullYear(today.getFullYear() - 1);


function formatDate(date) {
    let month = `${date.getMonth() + 1}`;
    let day = `${date.getDate()}`;
    const year = date.getFullYear();

    if (month.length < 2) month = `0${month}`;
    if (day.length < 2) day = `0${day}`;

    return [year, month, day].join('-');
}

const lastYearDateString = formatDate(today);

const startDateQuestion = [{
    type: 'input',
    name: 'date',
    validate(value) {
        const pass = value.match(
            /^\d{4}-\d{2}-\d{2}$/i,
        );
        if (pass) {
            return true;
        }

        return 'Please enter a date in the format YYYY-MM-DD';
    },
    default: lastYearDateString,
    message: 'Please enter a starting date (YYYY-MM-DD)',
}, ];

function initApiKey() {
    return new Promise((resolve, reject) => {
        getApiKey().then(() => {
            resolve();
        }, (error) => {
            if (error.code === 'ENOENT') {
                // No config file
                inquirer.prompt({
                    type: 'input',
                    name: 'api_key',
                    message: 'Please enter your Toggl API key (visit "My Profile" on https://toggl.com/ ):',
                }).then((answers) => {
                    const starterConfig = {
                        api_key: answers.api_key,
                    };
                    saveConfig(starterConfig).then(() => {
                        getApiKey().then(() => {
                            resolve();
                        }, (error) => {
                            reject(error);
                        });
                    }, () => {
                        const errorMessage = "There was an error with writing to the filesystem";
                        logger.error(errorMessage);
                        console.error(errorMessage)
                        reject(Error(errorMessage));
                    });
                });
            } else {
                logger.error(error);
                reject(error);
            }
        });
    });
}

function run() {
    initApiKey().then(() => {
        inquirer.prompt(startDateQuestion).then((answers) => {
            const startDate = answers.date;
            getWorkspace().then((workspace) => {
                getClients(workspace, startDate).then((client) => {
                    promptProjects(client);
                }).catch((error) => {
                    if (error.code === 'ECONNREFUSED') {
                        logger.error(error);
                        console.log('\nCould not connect to server');
                    } else {
                        logger.error(error.response.data);
                        console.log(`\n${error.response.data}`);
                    }
                    spinner.stop();
                    return 0;
                });
            }).catch((error) => {
                if (error.code === 'ECONNREFUSED') {
                    logger.error(error);
                    console.log('\nCould not connect to server');
                } else if (error.response) {
                    logger.error(error.response.data);
                    console.log(`\n${error.response.data}`);
                } else {
                    logger.error('No response');
                    logger.error(error);
                }
                spinner.stop();
                return 0;
            });
        })
    }, (error) => {
        logger.error(error);
    })
}

run()