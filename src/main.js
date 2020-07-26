const mongodb = require('mongodb').MongoClient;
const shell = require('shelljs');
// const {v1: uuidv1} = require('uuid');
const _ = require('lodash');
const fsp = require('fs').promises;
const fs = require('fs');

// note: we r running this script from root like 'node src/main.js' for that ./ & ../ path is chnaging

const { MONGODB_CONNECTION, CHECKER_NAME } = require('../config');

(async () => {
    const mongoClient = new mongodb(MONGODB_CONNECTION);
    let db = null

    await mongoClient.connect()
        .then(connection => {
            console.log('Mongodb connected successfully')

            db = connection.db('amz_watch')
        })
        .catch(() => {
            console.log('MongoDB connection error')
        })

    let pagesCollection = await db.collection('pages')
    let pagesMetaCollection = await db.collection('pages_meta')

    let lighthouseWorkableDesktop = {}
    let lighthouseWorkableMobile = {}

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function assignPagesToLighthouseDesktopWorkable() {
        while (true) {
            console.log('Getting page for desktop speed check ' + new Date().toString());

            if (_.size(lighthouseWorkableDesktop) !== 2) {
                let queryPipeline = [
                    {
                        $lookup: {
                            from: 'users_domains',
                            let: { domain_id: '$domain_id' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                {
                                                    $eq: [
                                                        '$$domain_id',
                                                        '$domain_id'
                                                    ]
                                                },
                                                {
                                                    $ne: [
                                                        { $type: '$domain_use_for.pages_speed_check_service' },
                                                        'missing'
                                                    ]
                                                },
                                                {
                                                    $ne: [
                                                        { $type: '$domain_use_for.pages_speed_check_service.status' },
                                                        'missing'
                                                    ]
                                                },
                                                {
                                                    $eq: [
                                                        '$domain_use_for.pages_speed_check_service.status',
                                                        'active'
                                                    ]
                                                }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: 'user_domain'
                        }
                    },

                    { $unwind: '$user_domain' },

                    // not taking page status currently but support added
                    // {
                    //     $lookup: {
                    //         from    : 'pages_meta',
                    //         let     : {page_id: {$toString: '$_id'}},
                    //         pipeline: [
                    //             {
                    //                 $match: {
                    //                     $expr: {
                    //                         $and: [
                    //                             {
                    //                                 $eq: [
                    //                                     '$$page_id',
                    //                                     '$page_id'
                    //                                 ]
                    //                             },
                    //                             {
                    //                                 $ne: [
                    //                                     {$type: '$page_status'},
                    //                                     'missing'
                    //                                 ]
                    //                             },
                    //                             {
                    //                                 $eq: [
                    //                                     '$page_status',
                    //                                     200
                    //                                 ]
                    //                             }
                    //                         ]
                    //                     }
                    //                 }
                    //             }
                    //         ],
                    //         as      : 'page_meta'
                    //     }
                    // },
                    //
                    // {$unwind: '$page_meta'},

                    {
                        $match: {
                            $expr: {
                                $and: [
                                    {
                                        $lt: [
                                            {
                                                $sum: [
                                                    {
                                                        $convert: {
                                                            input: '$updated_at.last_page_speed_desktop_checked_at',
                                                            to: 'double',
                                                            onError: 0,
                                                            onNull: 0
                                                        }
                                                    },
                                                    86400 * 1000 // to ms
                                                ]
                                            },
                                            new Date().getTime()
                                        ]
                                    },
                                ]
                            }
                        }
                    },

                    {
                        $addFields: {
                            id: { $toString: '$_id' }
                        }
                    },
                    // {$project: {_id: 0}}, // no need for now

                    { $sort: { 'updated_at.last_page_speed_desktop_checked_at': 1 } },
                    { $limit: 1 }
                ]

                let pagesForWork = await pagesCollection.aggregate(queryPipeline).toArray();

                // console.log(pagesForWork);

                if (pagesForWork.length) {
                    let pageForWork = pagesForWork[0];

                    if (!lighthouseWorkableDesktop.hasOwnProperty(pageForWork.id)) {
                        console.log('Assigning for work ' + pageForWork.id)

                        lighthouseWorkableDesktop[pageForWork.id] = {
                            url: pageForWork.url,
                            pageInfo: pageForWork,
                            working: false
                        }
                    }
                }
            }

            await sleep(3000)
        }
    }

    async function assignPagesToLighthouseMobileWorkable() {
        while (true) {
            console.log('Getting page for mobile speed check ' + new Date().toString());

            if (_.size(lighthouseWorkableMobile) !== 2) {
                let queryPipeline = [
                    {
                        $lookup: {
                            from: 'users_domains',
                            let: { domain_id: '$domain_id' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                {
                                                    $eq: [
                                                        '$$domain_id',
                                                        '$domain_id'
                                                    ]
                                                },
                                                {
                                                    $ne: [
                                                        { $type: '$domain_use_for.pages_speed_check_service' },
                                                        'missing'
                                                    ]
                                                },
                                                {
                                                    $ne: [
                                                        { $type: '$domain_use_for.pages_speed_check_service.status' },
                                                        'missing'
                                                    ]
                                                },
                                                {
                                                    $eq: [
                                                        '$domain_use_for.pages_speed_check_service.status',
                                                        'active'
                                                    ]
                                                }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: 'user_domain'
                        }
                    },

                    { $unwind: '$user_domain' },

                    // not taking page status currently but support added
                    // {
                    //     $lookup: {
                    //         from    : 'pages_meta',
                    //         let     : {page_id: {$toString: '$_id'}},
                    //         pipeline: [
                    //             {
                    //                 $match: {
                    //                     $expr: {
                    //                         $and: [
                    //                             {
                    //                                 $eq: [
                    //                                     '$$page_id',
                    //                                     '$page_id'
                    //                                 ]
                    //                             },
                    //                             {
                    //                                 $ne: [
                    //                                     {$type: '$page_status'},
                    //                                     'missing'
                    //                                 ]
                    //                             },
                    //                             {
                    //                                 $eq: [
                    //                                     '$page_status',
                    //                                     200
                    //                                 ]
                    //                             }
                    //                         ]
                    //                     }
                    //                 }
                    //             }
                    //         ],
                    //         as      : 'page_meta'
                    //     }
                    // },
                    //
                    // {$unwind: '$page_meta'},

                    {
                        $match: {
                            $expr: {
                                $and: [
                                    {
                                        $lt: [
                                            {
                                                $sum: [
                                                    {
                                                        $convert: {
                                                            input: '$updated_at.last_page_speed_mobile_checked_at',
                                                            to: 'double',
                                                            onError: 0,
                                                            onNull: 0
                                                        }
                                                    },
                                                    86400 * 1000 // to ms
                                                ]
                                            },
                                            new Date().getTime()
                                        ]
                                    },
                                ]
                            }
                        }
                    },

                    {
                        $addFields: {
                            id: { $toString: '$_id' }
                        }
                    },
                    // {$project: {_id: 0}}, // no need for now

                    { $sort: { 'updated_at.last_page_speed_mobile_checked_at': 1 } },
                    { $limit: 1 }
                ]

                let pagesForWork = await pagesCollection.aggregate(queryPipeline).toArray();

                // console.log(pagesForWork);

                if (pagesForWork.length) {
                    let pageForWork = pagesForWork[0];

                    if (!lighthouseWorkableMobile.hasOwnProperty(pageForWork.id)) {
                        console.log('Assigning for work ' + pageForWork.id)

                        lighthouseWorkableMobile[pageForWork.id] = {
                            url: pageForWork.url,
                            pageInfo: pageForWork,
                            working: false
                        }
                    }
                }
            }

            await sleep(3000)
        }
    }

    async function beforeLightHouseWork() {
        return await Promise.all([
            assignPagesToLighthouseDesktopWorkable(),
            assignPagesToLighthouseMobileWorkable()
        ])
    }

    function generateLighthouseDesktopResult(id) {
        if (!lighthouseWorkableDesktop.hasOwnProperty(id)) {
            return console.log('Somehow ' + id + ' got deleted')
        }

        let workerInfo = lighthouseWorkableDesktop[id]
        let url = workerInfo.url

        shell.exec(
            'lighthouse ' + url + ' --emulated-form-factor=desktop --chrome-flags="--headless --no-sandbox" --output=json --output-path=./src/results/desktop/' + id + '.json',
            { async: true },
            async function (code, stdout, stderr) {
                await pagesCollection.updateOne(
                    {
                        _id: workerInfo.pageInfo._id
                    },
                    {
                        $set: {
                            'updated_at.last_page_speed_desktop_checked_at': new Date().getTime().toString()
                        }
                    }
                )

                delete lighthouseWorkableDesktop[id];

                console.log('Done desktop result check for => ' + id)
            })
    }

    function generateLighthouseMobileResult(id) {
        if (!lighthouseWorkableMobile.hasOwnProperty(id)) {
            return console.log('Somehow ' + id + ' got deleted')
        }

        let workerInfo = lighthouseWorkableMobile[id]
        let url = workerInfo.url

        shell.exec(
            'lighthouse ' + url + ' --emulated-form-factor=mobile --chrome-flags="--headless --no-sandbox" --output=json --output-path=./src/results/mobile/' + id + '.json',
            { async: true },
            async function (code, stdout, stderr) {
                await pagesCollection.updateOne(
                    {
                        _id: workerInfo.pageInfo._id
                    },
                    {
                        $set: {
                            'updated_at.last_page_speed_mobile_checked_at': new Date().getTime().toString()
                        }
                    }
                )

                delete lighthouseWorkableMobile[id];

                console.log('Done mobile result check for => ' + url)
            })
    }

    function getDesktopWorkableEntry() {
        return _.findKey(lighthouseWorkableDesktop, [
            'working',
            false
        ])
    }

    function getMobileWorkableEntry() {
        return _.findKey(lighthouseWorkableMobile, [
            'working',
            false
        ])
    }

    async function desktopExecute() {
        while (true) {
            let workableId = getDesktopWorkableEntry()

            if (workableId && lighthouseWorkableDesktop.hasOwnProperty(workableId)) {
                lighthouseWorkableDesktop[workableId].working = true;

                generateLighthouseDesktopResult(workableId)
            }

            await sleep(3000);
        }
    }

    async function mobileExecute() {
        while (true) {
            let workableId = getMobileWorkableEntry()

            if (workableId && lighthouseWorkableMobile.hasOwnProperty(workableId)) {
                lighthouseWorkableMobile[workableId].working = true;

                generateLighthouseMobileResult(workableId)
            }

            await sleep(3000);
        }
    }

    async function executeLighthouse() {
        return await Promise.all([
            desktopExecute(),
            mobileExecute()
        ])
    }

    async function parseDesktopResult() {
        while (true) {
            console.log('Getting desktop results file list ' + new Date().toString())

            // currently working with one file at a time
            let files = fs.readdirSync('./src/results/desktop')
            _.pull(files, '.gitkeep')

            if (files.length > 0) {
                let pickedFile = files[0]
                let id = _.split(pickedFile, '.')[0]

                console.log('Now parsing desktop result file ' + pickedFile)

                try {
                    let result = await fsp.readFile('./src/results/desktop/' + pickedFile, 'utf8')

                    result = JSON.parse(result)

                    if (
                        result.hasOwnProperty('runWarnings')
                        && result.runWarnings.length
                        && !result.runWarnings[0].includes('was redirected to')
                    ) return;

                    if (result.hasOwnProperty('runtimeError') && Object.keys(result.runtimeError).length) return;

                    if (result.hasOwnProperty('userAgent')) {
                        delete result['userAgent']
                    }
                    if (result.hasOwnProperty('environment')) {
                        delete result['environment']
                    }

                    if (result.hasOwnProperty('timing') && result.timing.hasOwnProperty('total')) {
                        result['time taken to generate'] = result.timing.total;

                        delete result['timing'];
                    }

                    if (result.hasOwnProperty('configSettings')) {
                        delete result['configSettings']
                    }

                    if (result.hasOwnProperty('audits')) {
                        if (result.audits.hasOwnProperty('final-screenshot')) {
                            delete result.audits['final-screenshot']
                        }

                        if (result.audits.hasOwnProperty('screenshot-thumbnails')) {
                            delete result.audits['screenshot-thumbnails']
                        }

                        Object.keys(result.audits).forEach(key => {
                            if (result.audits[key].hasOwnProperty('id')) {
                                delete result.audits[key]['id'];
                            }

                            if (result.audits[key].hasOwnProperty('title')) {
                                delete result.audits[key]['title'];
                            }

                            if (result.audits[key].hasOwnProperty('description')) {
                                delete result.audits[key]['description'];
                            }
                        })
                    }

                    if (result.hasOwnProperty('categories')) {
                        if (
                            result.categories.hasOwnProperty('performance')
                            && result.categories.performance.hasOwnProperty('auditRefs')
                        ) {
                            delete result.categories.performance['auditRefs']
                        }

                        if (
                            result.categories.hasOwnProperty('accessibility')
                            && result.categories.accessibility.hasOwnProperty('auditRefs')
                        ) {
                            delete result.categories.accessibility['auditRefs']
                        }

                        if (
                            result.categories.hasOwnProperty('best-practices')
                            && result.categories['best-practices'].hasOwnProperty('auditRefs')
                        ) {
                            delete result.categories['best-practices']['auditRefs']
                        }

                        if (
                            result.categories.hasOwnProperty('seo')
                            && result.categories.seo.hasOwnProperty('auditRefs')
                        ) {
                            delete result.categories.seo['auditRefs']
                        }

                        if (
                            result.categories.hasOwnProperty('pwa')
                            && result.categories.pwa.hasOwnProperty('auditRefs')
                        ) {
                            delete result.categories.pwa['auditRefs']
                        }
                    }

                    if (result.hasOwnProperty('categoryGroups')) {
                        delete result['categoryGroups']
                    }

                    if (result.hasOwnProperty('i18n')) {
                        delete result['i18n']
                    }

                    // update result
                    await pagesMetaCollection.updateOne(
                        {
                            page_id: id
                        },
                        {
                            $setOnInsert: {
                                page_id: id
                            },
                            $set: {
                                lhr_desktop_result: result
                            }
                        },
                        { upsert: true }
                    )

                    console.log('Desktop result final size is ' + (JSON.stringify(result).length / 1000))

                    console.log('Done parsing desktop result ' + pickedFile);

                    fs.unlinkSync('./src/results/desktop/' + pickedFile);

                } catch (e) {

                    console.log('Something wrong with desktop file ' + pickedFile);

                }
            }

            await sleep(3000)
        }
    }

    async function parseMobileResult() {
        while (true) {
            console.log('Getting mobile results file list ' + new Date().toString())

            // currently working with one file at a time
            let files = await fs.readdirSync('./src/results/mobile')
            _.pull(files, '.gitkeep')

            if (files.length > 0) {
                let pickedFile = files[0]
                let id = _.split(pickedFile, '.')[0]

                console.log('Now parsing mobile result file ' + pickedFile)

                try {
                    let result = await fsp.readFile('./src/results/mobile/' + pickedFile, 'utf8')

                    result = JSON.parse(result)

                    if (
                        result.hasOwnProperty('runWarnings')
                        && result.runWarnings.length
                        && !result.runWarnings[0].includes('was redirected to')
                    ) return;

                    if (result.hasOwnProperty('runtimeError') && Object.keys(result.runtimeError).length) return;

                    if (result.hasOwnProperty('userAgent')) {
                        delete result['userAgent']
                    }
                    if (result.hasOwnProperty('environment')) {
                        delete result['environment']
                    }

                    if (result.hasOwnProperty('timing') && result.timing.hasOwnProperty('total')) {
                        result['time taken to generate'] = result.timing.total;

                        delete result['timing'];
                    }

                    if (result.hasOwnProperty('configSettings')) {
                        delete result['configSettings']
                    }

                    if (result.hasOwnProperty('audits')) {
                        if (result.audits.hasOwnProperty('final-screenshot')) {
                            delete result.audits['final-screenshot']
                        }

                        if (result.audits.hasOwnProperty('screenshot-thumbnails')) {
                            delete result.audits['screenshot-thumbnails']
                        }

                        Object.keys(result.audits).forEach(key => {
                            if (result.audits[key].hasOwnProperty('id')) {
                                delete result.audits[key]['id'];
                            }

                            if (result.audits[key].hasOwnProperty('title')) {
                                delete result.audits[key]['title'];
                            }

                            if (result.audits[key].hasOwnProperty('description')) {
                                delete result.audits[key]['description'];
                            }
                        })
                    }

                    if (result.hasOwnProperty('categories')) {
                        if (
                            result.categories.hasOwnProperty('performance')
                            && result.categories.performance.hasOwnProperty('auditRefs')
                        ) {
                            delete result.categories.performance['auditRefs']
                        }

                        if (
                            result.categories.hasOwnProperty('accessibility')
                            && result.categories.accessibility.hasOwnProperty('auditRefs')
                        ) {
                            delete result.categories.accessibility['auditRefs']
                        }

                        if (
                            result.categories.hasOwnProperty('best-practices')
                            && result.categories['best-practices'].hasOwnProperty('auditRefs')
                        ) {
                            delete result.categories['best-practices']['auditRefs']
                        }

                        if (
                            result.categories.hasOwnProperty('seo')
                            && result.categories.seo.hasOwnProperty('auditRefs')
                        ) {
                            delete result.categories.seo['auditRefs']
                        }

                        if (
                            result.categories.hasOwnProperty('pwa')
                            && result.categories.pwa.hasOwnProperty('auditRefs')
                        ) {
                            delete result.categories.pwa['auditRefs']
                        }
                    }

                    if (result.hasOwnProperty('categoryGroups')) {
                        delete result['categoryGroups']
                    }

                    if (result.hasOwnProperty('i18n')) {
                        delete result['i18n']
                    }

                    // update result
                    await pagesMetaCollection.updateOne(
                        {
                            page_id: id
                        },
                        {
                            $setOnInsert: {
                                page_id: id
                            },
                            $set: {
                                lhr_mobile_result: result
                            }
                        },
                        { upsert: true }
                    )

                    console.log('Mobile result final size is ' + (JSON.stringify(result).length / 1000))

                    console.log('Done parsing mobile result ' + pickedFile);

                    fs.unlinkSync('./src/results/mobile/' + pickedFile);

                } catch (e) {

                    console.log('Something wrong with mobile file ' + pickedFile);

                }
            }

            await sleep(3000)
        }
    }

    async function parseLighthouseResults() {
        return await Promise.all([
            parseDesktopResult(),
            parseMobileResult()
        ])
    }

    async function afterLighthouseWork() {
        return await Promise.all([
            parseLighthouseResults()
        ])
    }

    async function doLighthouseWork() {
        return await Promise.all([
            beforeLightHouseWork(),
            executeLighthouse(),
            afterLighthouseWork()
        ])
    }

    await Promise.all([
        doLighthouseWork()
    ])

    await mongoClient.close()
})();