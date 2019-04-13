#!/usr/bin/env node
const axios = require('axios')
const inquirer = require('inquirer')
const ora = require('ora')
const winston = require('winston')
const fs = require('fs')
const homedir = require('os').homedir();
var path = require('path');


var spinner = ora();

var program = require('commander');

var ProgressBar = require('ascii-progress');

program
  .version('1.0.0', '-v, --version')
  .description('View progress on Toggl projects')

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

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
// 
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
};

var hostname = process.env.NODE_ENV == 'production' || process.argv[2] == 'prod' ? 'https://toggl-progress.herokuapp.com' : 'http://localhost:3000';
var local_fs_dir_name = '.progress'
var configDir = path.normalize(`${homedir}/${local_fs_dir_name}`)
var togglApiKey;

var getApiKey = () => {
    return new Promise((resolve, reject) => {
        fs.readFile(`${configDir}/config.json`, (error, data) => {
            if (error) {
                if (error.code === "ENOENT") {
                    inquirer.prompt({
                        type: 'input',
                        name: 'api_key',
                        message: 'Please enter your Toggl API key (visit "My Profile" on https://toggl.com/ ):'
                    }).then((answers) => {
                        var starterConfig = {
                            api_key: answers.api_key
                        }
                        fs.mkdir(configDir, (error) => {
                            if (error && error.code !== "EEXIST") {
                                logger.error(error);
                            } else {
                                fs.writeFile(`${configDir}/config.json`, JSON.stringify(starterConfig), { recursive: true } ,(error) => {
                                    if (error) {
                                        logger.error(error);
                                    } else {
                                        togglApiKey = answers.api_key;
                                        resolve();
                                    }
                                })
                            }
                        })
                    })
                } else {
                    reject(error);
                }
            } else {
                // File exists
                var config = JSON.parse(data);
                togglApiKey = config.api_key;
                resolve();
            }
        });
    })
}

var today = new Date();
today.setFullYear(today.getFullYear()-1);
var last_year_date_string = formatDate(today);

var startDateQuestion = [
    {
        type: 'input',
        name: 'date',
        validate: function(value) {
            var pass = value.match(
              /^\d{4}-\d{2}-\d{2}$/i
            );
            if (pass) {
              return true;
            }
      
            return 'Please enter a date in the format YYYY-MM-DD';
        },
        default: last_year_date_string,
        message: 'Please enter a starting date (YYYY-MM-DD)'
    }
]
var run = () => {

    if (process.env.NODE_ENV !== 'production' ) {
        console.log("Running dev version connecting to "+hostname);
    }

    getApiKey().then(() => {
        inquirer.prompt(startDateQuestion).then((answers) => {
            var start_date = answers.date;
            getWorkspace().then((workspace) => {
                getClients(workspace, start_date).then((client) => {
                    promptProjects(client);
                }).catch((error) => {
                    if (error.code === 'ECONNREFUSED') {
                        logger.error(error);
                        console.log("\nCould not connect to server");
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
                    console.log("\nCould not connect to server");
                } else {
                    if (error.response) {
                        logger.error(error.response.data);
                        console.log(`\n${error.response.data}`);
                    } else {
                        logger.error("No response")
                        logger.error(error)
                    }
                }
                spinner.stop();
                return 0;
            })
        })
    }, (error) => {
        logger.error(error);
    })
}
run();

var getWorkspace = () => {
    spinner.start('Loading Workspaces');
    return new Promise((resolve, reject) => {
        axios({
            method: "get",
            url: hostname+"/workspaces",
            headers: {
                "content-type": "application/json",
                "access-key": togglApiKey
            }
        }).then((response) => {
            spinner.succeed('Loaded Workspaces');
            var workspaces = response.data;
            var choices = workspaces.map((workspace) => {
                return {
                    name : workspace.name,
                    value : workspace.id
                }
            })
            var questions = [
                {
                    type: 'list',
                    name: 'workspace',
                    choices: choices,
                    message: 'Please select a Workspace'
                }
            ]
            inquirer.prompt(questions).then((answers) => {
                var workspace_id = answers.workspace;
                resolve(workspace_id)
                
            })
        }).catch((error) => {
            reject(error);
            return;
        });
    })
}

var getClients = (workspace_id, start_date) => {
    spinner.start('Loading Clients');
    return new Promise((resolve, reject) => {
        axios({
            method: "get",
            url: hostname+"/clients/"+workspace_id,
            headers: {
                "content-type": "application/json",
                "access-key": togglApiKey
            }
        }).then((response) => {
            spinner.succeed('Loaded Clients');
            var clients = response.data;
            var choices = clients.map((client) => {
                return {
                    name : client.name,
                    value : {
                        name: client.name,
                        id : client.id
                    }
                }
            })
            var questions = [
                {
                    type: 'list',
                    name: 'client',
                    choices: choices,
                    message: 'Please select a Client'
                }
            ]
            inquirer.prompt(questions).then((answers) => {
                var client = answers.client;
                getClient(client.id, client.name, workspace_id, start_date).then((client) => {
                    resolve(client);
                }).catch((error) => {
                    logger.error(error);
                    reject(error);
                })
            })
        }).catch((error) => {
            spinner.fail('Failed to load Clients');
            logger.error(error);
            reject(error);
        });
    })
}

var getClient = (client_id, client_name, workspace_id, start_date) => {
    spinner.start('Loading info for '+client_name);
    return new Promise((resolve, reject) => {
        axios({
            method: "get",
            url: hostname+"/workspace/"+workspace_id+"/client/"+client_id,
            params: {
                start_date : start_date
            },
            headers: {
                "content-type": "application/json",
                "access-key": togglApiKey
            }
        }).then((response) => {
            spinner.stop('Loaded info for '+client_name);
            var client = response.data;
            resolve(client);
        }).catch((error) => {
            spinner.fail('Failed to load info for '+client_name);
            logger.error(error);
            reject(error);
        });
    })
}

var getProject = (client_id, project_name) => {
    spinner.start('Loading info for '+project_name);
    return new Promise((resolve, reject) => {
        axios({
            method: "get",
            url: hostname+"/project",
            params: {
                client_id : client_id,
                project_name : project_name
            },
            headers: {
                "content-type": "application/json"
            }
        }).then((response) => {
            spinner.stop('Loaded info for '+project_name);
            var project = response.data;
            resolve(project);
        }).catch((error) => {
            spinner.fail('Failed to load info for '+project_name);
            logger.error(error);
            reject(error);
        });
    })
}

var updateProject = (client_id, project_name) => {
    return new Promise((resolve, reject) => {
        var questions = [
            {
                type: 'input',
                name: 'estimate',
                message: 'Please enter an estimate in number of hours'
            },
            {
                type: 'input',
                name: 'rate',
                message: 'Please enter an hourly rate in dollars'
            },
        ]
        inquirer.prompt(questions).then((answers) => {
            spinner.start('Saving info for '+project_name);
            axios({
                method: "PATCH",
                url: hostname+"/project",
                data: {
                    client_id : client_id,
                    project_name : project_name,
                    estimate : answers.estimate,
                    rate : answers.rate
                },
                headers: {
                    "content-type": "application/json"
                }
            }).then((response) => {
                spinner.stop('Saved info for '+project_name);
                var project = response.data;
                resolve(project);
            }).catch((error) => {
                spinner.fail('Failed to save info for '+project_name);
                logger.error(error);
                reject(error);
            });
        })
    });
}

function formatDate(date) {
        var month = '' + (date.getMonth() + 1);
        var day = '' + date.getDate();
        var year = date.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}

var promptProjects = (client) => {
    var choices = client.projects.map((project) => {
        return project.name
    })
    var questions = [
        {
            type: 'list',
            name: 'project',
            choices: choices,
            message: 'Please select a Project',
        }
    ]
    inquirer.prompt(questions).then((answers) => {
        var project = answers.project;
        getProject(client.id, project).then((project) => {
            if (!project.estimate) {
                var questions = [
                    {
                        type: 'confirm',
                        name: 'add_estimate',
                        message: 'No estimate found, would you like to set one?'
                    }
                ]
                inquirer.prompt(questions).then((answers) => {
                    if (answers.add_estimate) {
                        updateProject(client.id, project.name).then((project) => {
                            showResults(client, project);
                        });
                    } else {
                        promptProjects(client);
                    }
                })
            } else {
                showResults(client, project);
            }
        });
    })
}

var showResults = (client, project) => {
    var toggl_project = client.projects.find((value) => {
        return value.name === project.name;
    });
    var current_hours = (toggl_project.effort/1000/60/60);
    var percentage = (current_hours/project.estimate)*100;
    var bar = new ProgressBar({
        schema: '╢:bar╟ :percent :current hrs/:total estimated ($:cost/$:price)\n',
        blank: '░',
        filled: '█',
        total: project.estimate
    })
    bar.update(percentage/100, {
        current : current_hours,
        cost : parseFloat(current_hours*project.rate).toFixed(0),
        price : parseFloat(project.estimate*project.rate).toFixed(0)
    });

    var questions = [
        {
            type: 'confirm',
            name: 'again',
            message: 'Check another project?',
        }
    ]
    inquirer.prompt(questions).then((answers) => {
        if (answers.again) {
            run();
        } else {
            return;
        }
    });
}



