#!/usr/bin/env node
const axios = require('axios')
const inquirer = require('inquirer')
const ora = require('ora');

var spinner = ora();

var program = require('commander');

var ProgressBar = require('ascii-progress');

program
  .version('1.0.0', '-v, --version')
  .description('Get or set estimates for Toggl projects, and track progress')
  .option('-p, --key', 'API Key')
  .option('-d, --start-date', 'Starting date (YYYY-MM-DD)')
program.parse(process.argv);

var hostname = 'http://localhost:3000';

var getWorkspace = () => {
    spinner.start('Loading Workspaces');
    return new Promise((resolve, reject) => {
        axios({
            method: "get",
            url: hostname+"/workspaces",
            headers: {
                "content-type": "application/json"
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
            console.error(error);
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
                "content-type": "application/json"
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
                    console.error(error);
                    reject(error);
                })
            })
        }).catch((error) => {
            spinner.fail('Failed to load Clients');
            console.error(error);
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
                "content-type": "application/json"
            }
        }).then((response) => {
            spinner.stop('Loaded info for '+client_name);
            var client = response.data;
            resolve(client);
        }).catch((error) => {
            spinner.fail('Failed to load info for '+client_name);
            console.error(error);
            reject(error);
        });
    })
}

var getEstimate = (client_id, project_name) => {
    spinner.start('Loading info for '+project_name);
    return new Promise((resolve, reject) => {
        axios({
            method: "get",
            url: hostname+"/estimate",
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
            console.error(error);
            reject(error);
        });
    })
}

var updateEstimate = (client_id, project_name) => {
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
                message: 'Please enter an hourly rate in NZD'
            },
        ]
        inquirer.prompt(questions).then((answers) => {
            spinner.start('Saving info for '+project_name);
            axios({
                method: "post",
                url: hostname+"/estimate",
                data: {
                    client_id : client_id,
                    project_name : project_name,
                    estimate : answers.estimate,
                    rate : answers.rate
                },
                headers: {
                    "content-type": "application/json"
                }
            }).then(() => {
                spinner.stop('Saved info for '+project_name);
                resolve(true);
            }).catch((error) => {
                spinner.fail('Failed to save info for '+project_name);
                console.error(error);
                reject(error);
            });
        })
    });
}

var questions = [
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
        message: 'Please enter a starting date (YYYY-MM-DD)'
    }
]
inquirer.prompt(questions).then((answers) => {
    var start_date = answers.date;
    getWorkspace().then((workspace) => {
        getClients(workspace, start_date).then((client) => {
            var choices = client.projects.map((project) => {
                return project.name
            })
            var questions = [
                {
                    type: 'list',
                    name: 'project',
                    choices: choices,
                    message: 'Please select a Project'
                }
            ]
            inquirer.prompt(questions).then((answers) => {
                var project = answers.project;
                getEstimate(client.id, project).then((project) => {
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
                                updateEstimate(client.id, project.name);
                            } else {
                                return;
                            }
                        })
                    } else {
                        var toggl_project = client.projects.find((value) => {
                            return value.name === project.name;
                        });
                        var current_hours = (toggl_project.effort/1000/60/60);
                        var percentage = (current_hours/project.estimate)*100;
                        var bar = new ProgressBar({
                            schema: '╢:bar╟ :percent :current hrs/:total estimated ($:cost/$:price)',
                            blank: '░',
                            filled: '█',
                            total: project.estimate
                        })
                        bar.update(percentage/100, {
                            current : current_hours,
                            cost : parseFloat(current_hours*project.rate).toFixed(0),
                            price : parseFloat(project.estimate*project.rate).toFixed(0)
                        });
                        
                    }
                });
            })
        }).catch((error) => {
            console.error(error);
        });
    }).catch((error) => {
        console.error(error);
    })
})



