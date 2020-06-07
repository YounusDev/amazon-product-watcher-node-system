const mongodb = require('mongodb').MongoClient;
const shell   = require('shelljs');
// const {v1: uuidv1} = require('uuid');
const _       = require('lodash');
const fs      = require('fs');

(async () => {
    const mongoClient = new mongodb('mongodb://localhost:27017');
    let db            = null

    await mongoClient.connect()
        .then(connection => {
            db = connection.db('amz_watch')
        })
        .catch(() => {
            console.log('MongoDB connection error')
        })

    let pagesCollection     = await db.collection('pages')
    let pagesMetaCollection = await db.collection('pages_meta')

    let lighthouseWorkableDesktop = {}

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function assignPagesToLighthouseDesktopWorkable() {
        while (true) {
            if (_.size(lighthouseWorkableDesktop) !== 1) {
                let queryPipeline = [
                    {
                        $lookup: {
                            from    : 'users_domains',
                            let     : {domain_id: '$domain_id'},
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
                                                        {$type: '$domain_use_for.pages_speed_check_service'},
                                                        'missing'
                                                    ]
                                                },
                                                {
                                                    $ne: [
                                                        {$type: '$domain_use_for.pages_speed_check_service.status'},
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
                            as      : 'user_domain'
                        }
                    },

                    {$unwind: '$user_domain'},

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
                                                            input  : '$updated_at.last_page_speed_desktop_checked_at',
                                                            to     : 'double',
                                                            onError: 0,
                                                            onNull : 0
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
                            id: {$toString: '$_id'}
                        }
                    },
                    // {$project: {_id: 0}}, // no need for now

                    {$sort: {'updated_at.last_page_speed_desktop_checked_at': 1}},
                    {$limit: 1}
                ]

                let pagesForWork = await pagesCollection.aggregate(queryPipeline).toArray();

                // console.log(pagesForWork);

                if (pagesForWork.length) {
                    let pageForWork = pagesForWork[0];

                    lighthouseWorkableDesktop[pageForWork.id] = {
                        url     : pageForWork.url,
                        pageInfo: pageForWork,
                        working : false
                    }
                }
            }

            await sleep(1000)
        }
    }

    async function beforeLightHouseWork() {
        return await Promise.all([
            assignPagesToLighthouseDesktopWorkable()
        ])
    }

    function generateLighthouseDesktopResult(id) {
        if (!lighthouseWorkableDesktop.hasOwnProperty(id)) {
            return console.log('Somehow ' + id + ' got deleted')
        }

        let workerInfo = lighthouseWorkableDesktop[id]
        let url        = workerInfo.url

        shell.exec(
            'lighthouse ' + url + ' --emulated-form-factor=desktop --output=json --output-path=./results/desktop/' + id + '.json',
            {async: true},
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

                console.log('Done ' + id)
            })
    }

    function getDesktopWorkableEntry() {
        return _.findKey(lighthouseWorkableDesktop, [
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

            await sleep(500);
        }
    }

    async function executeLighthouse() {
        return await Promise.all([
            desktopExecute()
        ])
    }

    async function parseDesktopResult() {
        while (true) {
            // currently working with one file at a time
            let files = await fs.readdirSync('./results/desktop')
            _.pull(files, '.gitkeep')

            if (files.length > 0) {
                let pickedFile = files[0]
                let id         = _.split(pickedFile, '.')[0]

                console.log('Now parsing ' + pickedFile)

                await fs.readFile(
                    './results/desktop/' + pickedFile,
                    'utf8',
                    async (err, file) => {
                        let result = JSON.parse(file)

                        // console.log(result)

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
                                $set        : {
                                    lhr_desktop_result: result
                                }
                            },
                            {upsert: true}
                        )

                        console.log('=== size is ' + (JSON.stringify(result).length / 1000))
                    }
                )

                console.log('Done parsing ' + pickedFile);

                fs.unlinkSync('./results/desktop/' + pickedFile);
            }

            await sleep(500)
        }
    }

    async function parseLighthouseResults() {
        return await Promise.all([
            parseDesktopResult()
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