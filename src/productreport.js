require('dotenv').config();
const fs = require('fs');
const stripAnsi = require('strip-ansi');
const RPClient = require('reportportal-js-client');

const baseUrl = process.env.REPORT_PORTAL_BASE_URL + '/api/v1';

export default class ProductReport {

    constructor() {
        this.projectName = process.env.REPORT_PORTAL_PROJECT_NAME;
        this.launchName = process.env.REPORT_PORTAL_LAUNCH_NAME || this.projectName;
        this.fixtureList = [];

        this.rpClient = new RPClient({
            token : process.env.REPORT_PORTAL_TOKEN,
            endpoint : baseUrl,
            launch : this.launchName,
            project : this.projectName
        });

        this.rpClient.checkConnect().then((response) => {
            // console.log('You have successfully connected to the server.');
            // console.log(`You are using an account: ${response.full_name}`);
        }, (error) => {
            console.log('Error connecting to ReportPortal, confirm that your details are correct.');
            console.dir(error);
        });
    }

    startLaunch() {
        const launchObj = this.rpClient.startLaunch({
            name: this.launchName
        });

        return launchObj.tempId;
    }

    captureFixtureItem(launchId, fixtureName) {
        const suiteObj = this.rpClient.startTestItem({
            name: fixtureName,
            type: 'SUITE'
        }, launchId);

        this.fixtureList.push(suiteObj.tempId);
        return suiteObj.tempId;
    }

    captureTestItem(launchId, fixtureId, stepName, status, testRunInfo, parentSelf) {
        var start_time = this.rpClient.helpers.now();
        const stepObj = this.rpClient.startTestItem({
            name: stepName,
            start_time: start_time,
            type: 'STEP'
        }, launchId, fixtureId);

        if (testRunInfo.screenshots) {
            testRunInfo.screenshots.forEach((screenshot, idx) => {
                // console.log('screenshotPath -> ', screenshot.screenshotPath);

                const screenshotContent = fs.readFileSync(screenshot.screenshotPath);

                this.rpClient.sendLog(stepObj.tempId, 
                    {
                        status: 'error',
                        message: 'Error Screenshot',
                        time: start_time
                    },
                    {
                        name: `${stepName}.png`,
                        type: 'image/png',
                        content: screenshotContent
                    }
                );
            });
        }

        if (testRunInfo.errs) {
            testRunInfo.errs.forEach((err, idx) => {
                err = parentSelf.formatError(err);

                this.rpClient.sendLog(stepObj.tempId, {
                    status: 'error',
                    message: stripAnsi(err),
                    time: start_time
                });
            });
        }

        var testResult = {
            status: status,
            end_time: start_time + testRunInfo.durationMs
        };

        if (status === 'skipped') testResult.issue = { issue_type: 'NOT_ISSUE' };

        this.rpClient.finishTestItem(stepObj.tempId, testResult);
    }

    finishFixture() {
        this.fixtureList.forEach((fixtureId, idx) => {
            this.rpClient.finishTestItem(fixtureId, {
                end_time: this.rpClient.helpers.now()
            });
        });
    }

    finishLaunch(launchId) {
        this.finishFixture();
        this.rpClient.finishLaunch(launchId, {
            end_time: this.rpClient.helpers.now()
        });
    }

}
