#!/usr/bin/env node

var config  = require('./config.json');
var fs      = require('fs');
var express = require('express');
var app     = express();
var queue   = require('queue-async');
var tasks   = queue(1);
var spawn   = require('child_process').spawn;

app.use(express.bodyParser());

// Receive webhook post
app.post('/hooks/jekyll', function(req, res) {

    // Close connection
    res.send(202);

    // Queue request handler
    tasks.defer(function(req, res, cb) {
        var data = req.body.payload;
        var branch = req.params.branch;
        var params = [];

        // Parse webhook data for internal variables
        data.repo = data.repository.name;
        data.branch = data.ref.split('/')[2];
        data.owner = data.repository.owner.name;

        // End early if not permitted account
        if (config.accounts.indexOf(data.owner) === -1) {
            console.log(data.owner + ' is not an authorized account.');
            if (typeof cb === 'function') cb();
            return;
        }

        // End early if not permitted branch
        if (config.branches.indexOf(data.branch) === -1) {
            console.log(data.branch + ' is not configured for deployment.');
            if (typeof cb === 'function') cb();
            return;
        }

        // Process webhook data into params for scripts
        /* repo   */ params.push(data.repo);
        /* branch */ params.push(data.branch);
        /* owner  */ params.push(data.owner);
        /* giturl */ params.push('git@' + config.gh_server + ':' + data.owner + '/' + data.repo + '.git');
        /* source */ params.push(config.temp + '/' + data.owner + '/' + data.repo + '/' + data.branch + '/' + 'code');
        /* build  */ params.push(config.temp + '/' + data.owner + '/' + data.repo + '/' + data.branch + '/' + 'site');

        // Run build script
        run(config.scripts.build, params, function(err) {
            if (err) {
                console.log('Failed to build: ' + data.owner + '/' + data.repo);

                if (typeof cb === 'function') cb();
                return;
            }

            // Run publish script
            run(config.scripts.publish, params, function(err) {
                if (err) {
                    console.log('Failed to publish: ' + data.owner + '/' + data.repo);

                    if (typeof cb === 'function') cb();
                    return;
                }

                // Done running scripts
                console.log('Successfully rendered: ' + data.owner + '/' + data.repo);

                if (typeof cb === 'function') cb();
                return;
            });
        });
    }, req, res);

});

// Start server
var port = process.env.PORT || 8080;
app.listen(port);
console.log('Listening on port ' + port);

function run(file, params, cb) {
    var process = spawn(file, params);

    process.stdout.on('data', function (data) {
        console.log('' + data);
    });

    process.stderr.on('data', function (data) {
        console.warn('' + data);
    });

    process.on('exit', function (code) {
        if (typeof cb === 'function') cb(code !== 0);
    });
}
