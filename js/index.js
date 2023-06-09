mapboxgl.accessToken = 'pk.eyJ1Ijoic2FtZ2FydHJlbGwiLCJhIjoiY2w3OWt3MW00MDNjbDN2cGRpc20ya3JnbyJ9.6t2ISNlyP1BvBmkSH2Ks_Q';

// initialize map
var map = new mapboxgl.Map({
    container: 'map', // pointing to the above "map" div
    style: 'mapbox://styles/samgartrell/cl7tnbdlk000215qdvkret4rv',
    center: [-122.3460007, 44.87574640],
    maxBounds: [
        [
            -126.255,
            40.4435

        ],
        [
            -114.933,
            47.444
        ]
    ],
    zoom: 8
});

// Add geolocate control to the map.
map.addControl(
    new mapboxgl.NavigationControl()
);

map.addControl(
    new mapboxgl.GeolocateControl({
        positionOptions: {
            enableHighAccuracy: true
        },
        // When active the map will receive updates to the device's location as it changes.
        trackUserLocation: true,
        // Draw an arrow next to the location dot to indicate which direction the device is heading.
        showUserHeading: true
    })
);

// manually add custom buttons to the right control group div
const rightCtrlGroup = document.getElementsByClassName('mapboxgl-ctrl-top-right')[0];

// info toggle
const infoCtrl = document.createElement('div');
infoCtrl.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

infoCtrl.innerHTML = `
    <button id='toggleInfo' role="button" onclick="toggleInfo('info-box', 'toggleInfo')">
    <svg class="icon" id="info"></svg>
    </button>
`;
rightCtrlGroup.appendChild(infoCtrl);

// graph toggle
const graphCtrl = document.createElement('div');
graphCtrl.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

graphCtrl.innerHTML = `
    <button id='toggleGraph' role="button" onclick="toggleGraph('chart-box', 'toggleGraph')">
    <svg class="icon" id="graph"></svg>
    </button>
`;
rightCtrlGroup.appendChild(graphCtrl);



// THIS SECTION HANDLES CURRENT DATA RETRIEVAL
// set endpoint
var endpoint = `https://waterservices.usgs.gov/nwis/iv/?format=json&indent=on&stateCd=or&${formatDateStamp(0)}&parameterCd=00060&siteStatus=active`
// console.log(endpoint)

// send api request
fetch(endpoint)
    // parse as JSON 
    .then(response => response.json())
    .then(data => {

        // get data body
        var gauges = data.value.timeSeries;

        // set a counter and limit for testing
        let counter = 0;
        let limit = 999;

        // iterate through locations, adding each one to the map
        gauges.forEach(function (gauge) {
            counter++;
            if (counter <= limit) {
                try {
                    try {
                        // make a little gauge object "g" for better readability
                        g = {
                            'lat': gauge.sourceInfo.geoLocation.geogLocation.latitude,
                            'lon': gauge.sourceInfo.geoLocation.geogLocation.longitude,
                            'title': formatTitleCase(gauge.sourceInfo.siteName),
                            'id': gauge.sourceInfo.siteCode[0].value,
                            'data': {
                                'value': gauge.values[0].value[0].value,
                                'time': gauge.values[0].value[0].dateTime,
                                'desc': gauge.variable.variableDescription,
                                'unit': gauge.variable.unit.unitcode
                            }
                        };
                    } catch (error) {
                        // sometimes the values array gets finnicky--just look 1 layer further into the array
                        if (error instanceof TypeError) {
                            g = {
                                'lat': gauge.sourceInfo.geoLocation.geogLocation.latitude,
                                'lon': gauge.sourceInfo.geoLocation.geogLocation.longitude,
                                'title': formatTitleCase(gauge.sourceInfo.siteName),
                                'id': gauge.sourceInfo.siteCode[0].value,
                                'data': {
                                    'value': gauge.values[1].value[0].value,
                                    'time': gauge.values[1].value[0].dateTime,
                                    'desc': gauge.variable.variableDescription,
                                    'unit': gauge.variable.unit.unitcode
                                }
                            };
                        } else {
                            // non-TypeErrors have never happened but just to be sure...
                            console.log(error)
                        }
                    }

                    // create a DOM element for each marker (this is how icons are styled)
                    const el = document.createElement('div');
                    el.className = 'marker';
                    el.style.backgroundImage = `url(./img/semi.svg)`;
                    el.style.width = `20px`;
                    el.style.height = `20px`;
                    el.style.backgroundSize = '100%';

                    // create the Mapbox marker object and add it to the map
                    let marker = new mapboxgl.Marker(el)
                        .setLngLat([g.lon, g.lat])
                        .addTo(map)

                    let element = marker.getElement()
                    element.setAttribute('siteid', `${g.id}`)
                    element.setAttribute(
                        // this enables markers to send their id to the chart to render the graph
                        'onClick', "passID(this)" 
                    );
                } catch (error) {
                    // this hasn't happened yet
                    console.log(`error:`, gauge, error)
                }
            }
        }
        )
    }
    );

// retrieve data for last 7 days and restructure to be ingestible by renderChart()
// an array of promises is also returned, in case the requests are still executing
// TODO: put this in a timeout loop that runs every hour or something, so the map is fresh when left open overnight or something
const structuredData = retrieveData()
// console.log(structuredData)

// CHART
// set up a mutation observer to listen for changes to the ID in chartEl (proxy for click event on a given gauge)
const chartEl = document.getElementById('line-canvas')
const linkEl = document.getElementById('usgs-link')

// options for the observer (which mutations to observe)
const config = { attributes: true, childList: false, subtree: false };

// callback function to execute when mutations are observed
const callback = (mutationList) => {
    for (const mutation of mutationList) {
        // only fire if the mutation concerns "siteid"
        if (mutation.type === "attributes" && mutation.attributeName === "siteid") {
            let siteId = mutation.target.getAttribute("siteid")
            try {
                if (chrt != undefined) {
                    chrt.destroy(); // without this, the charts persist and jump back and forth on hover
                }
            } catch {
                ReferenceError // in case there's no chart yet and the above if fired anyway
            } finally {
                if (structuredData[siteId] != undefined) {
                    // handle mobile/pc screen dimension stuff
                    if (window.innerHeight <= window.innerWidth) {
                        chartEl.parentElement.parentElement.style.maxWidth = '50vw'
                    } else {
                        chartEl.parentElement.parentElement.style.maxWidth = null
                    }

                    // see renderChart docstring... structuredData is a json indexable by siteId
                    chrt = renderChart(chartEl, structuredData[siteId], autoShow = true);
                    
                    // see renderLink docstring
                    renderLink(linkEl, siteId, text = 'view USGS graph')

                } else {
                    // this hasn't been happening, but leaving it in case
                    console.log('7 day history unavailable for this location')
                    // TODO: chart current values or something?
                }
            }

        }
    }
};

// initialize and run the observer specified above
const observer = new MutationObserver(callback);
observer.observe(chartEl, config);

// TODO: enable click-away from the chart with something like the following:
// map.on('click', function () {
    // if id variable passed to chart has not changed,
    // close the graph (ideally, the clicked icon will change color)
    // else,
    // do nothing and the new graph will render.
// });

// FUNCS:
// TODO: move these to a separate file and figure out how to import as module
function formatDateStamp(daysAgo, hrWindow = 1) {
    /**
     * creates a duration stamp in ISO-8601 format corresponding to a specified number of days before (the present - 1 hour)
     * @param {int} daysAgo the number of days to go into the past
     * @param {int} hrWindow the number of hours the stamp should span (default 1) 
     */
    // get/freeze now 
    // (make it an hour ago just so data is guaranteed to have been transmitted to USGS db in last hr, if daysAgo=0)
    const now = new Date(Date.now() - 4 * 60 * 60 * 1000);

    // set start date to now - (number of days ago we're targeting * day length in ms)
    const end = new Date(now - daysAgo * 24 * 60 * 60 * 1000);

    // set end date to start date - number of hours of observations we want in ms
    const start = new Date(end - hrWindow * 60 * 60 * 1000);

    // format the string like startDT=2023-04-20T11:18-0700&endDT=2023-04-20T12:18-0700
    return `startDT=${start.toISOString()}&endDT=${end.toISOString()}`;
}

function getMarkerColor(attributes) {
/**
     * // color markers based on stream depth (not used, since depth isn't currently retrieved)
     * @param {object} attributes attributes corresponding to a gauge marker
     */
    if (attributes.depth < 2) {
        return 'green';
    } else if (attributes.depth < 4) {
        return 'yellow';
    } else {
        return 'red';
    }
};


function passID(e, chartEl = document.getElementById('line-canvas')) {
    /**
     * passes a gauge's id to the chart element
     * @param e the element possessing this method
     * @param chartEl the chart element 
     */
    id = e.getAttribute('siteid')
    chartEl.setAttribute('siteid', id)
    // console.log(id)
};

function retrieveData() {
    /*
    Retrieves flow data for all stream gauges for the last 7 days, 
    then restructures the result into an object to be parsed by the graph function 
    (promise logic courtesty of ChatGPT)
    */

    // TODO: reiintegrate this array with labels in the chart function?
    const days = [
        "last week",
        "6 days ago",
        "5 days ago",
        "4 days ago",
        "3 days ago",
        "yesterday",
        "today",
    ];
    const results = {};

    // create an array of promises
    const promises = days.map((day, i) => {
        // promises are fulfilled when requests are returned for each day of the week
        const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&indent=on&stateCd=or&${formatDateStamp(i)}&parameterCd=00060&siteStatus=active`;
        // parse into JSON
        return fetch(url).then(response => response.json());
    });

    // wait for all promises to resolve before continuing
    Promise.all(promises).then(data => {
        data.forEach(json => {
            const timeSeries = json.value.timeSeries;
            for (let j = 0; j < timeSeries.length; j++) {
                // restructure the results into a single JSON
                const siteCode = timeSeries[j].sourceInfo.siteCode[0].value;
                const siteName = timeSeries[j].sourceInfo.siteName;

                // handle formatting differences in data
                if (!results[siteCode]) {
                    results[siteCode] = {
                        name: siteName,
                        readings: {}
                    };
                }

                try {
                    // using "let" to enable error recovery
                    let readings = timeSeries[j].values[0].value.map(v => parseFloat(v.value));
                    let index = data.indexOf(json) + 1;
                    results[siteCode].readings[index] = readings;

                } catch (error) {
                    if (error instanceof TypeError && timeseries[j].values) {
                        // if len(values array) > 1, try the next one to see if it has readings in it
                        let readings = timeSeries[j].values[1].value.map(v => parseFloat(v.value));
                        let index = data.indexOf(json) + 1;
                        results[siteCode].readings[index] = readings;
                    }

                }

            }
        });

    }).catch(error => {
        // this hasn't happened yet
        console.error(error);
    });
    return results
}

function renderChart(e, siteData, autoShow = false, btn = document.getElementById('toggleGraph')) {
    /**
     * renders the chart element, working in tandem with the event listener above
     * @param e the element where the chart lives
     * @param siteData the json of 7-day readings belonging to a given site
     * @param autoShow determines if the graph should be revealed whenever rendered
     * @param btn the button that triggers the chart
     */
    if (autoShow) {
        // automatically show the graph when a gauge is clicked
        e.parentElement.parentElement.style.display = 'block'
        e.parentElement.parentElement.style.opacity = '1'

        // toggle button image
        img = btn.children[0]

        // update button display
        btn.style.display = 'block'
        btn.style.width = '30px'

        // change symbology of icon
        img.style.rotate = '45deg'
        img.style['background-image'] = 'url(./img/plus.svg)'
    };

    // an object to organize graph styling handled outside style.css
    const colors = {
        'neutral': {
            'light': 'rgba(255, 255, 255, 0.1)',
            'dark': 'rgb(30,33,40)',
            'bright': 'rgba(255, 255, 255, .7)'
        },
        'theme': {
            'blue': '#1CD6D9',
            'mutedBlue': 'rgba(28,214,217, .1)'
        }
    }

    // initialize canvas element for chart.js
    var ctx = e.getContext("2d");

    // TODO: relevant to integrate with the requests section? Maybe incorporate into siteData?
    const labels = [
        "last week",
        "6 days ago",
        "5 days ago",
        "4 days ago",
        "3 days ago",
        "yesterday",
        "today",
    ];

    // initialize and populate a list to hold 7 days of flow rates
    let flowRates = [];
    for (let i = 1; i <= 7; i++) {
        vals = siteData["readings"][i]; //for each of the 7 arrays of readings,
        mean = vals.reduce(
            (acc, val) => acc + val, 0
        ) / vals.length; // get their mean value
        flowRates.push( // and add it to flowRates
            Math.round(mean, 0),
        )

    }

    // reverse flow rates to put the sequence of readings in chronological order
    // TODO: change direction that flow rates array is added to to eliminate this step
    flowRates = flowRates.reverse()

    // create an object to hold the chart data and style (inherits from colors object)
    let data = {
        labels,
        datasets: [{
            data: flowRates,
            // label: formatTitleCase(siteData.name), // takes name out of datatooltip
            fill: true,
            backgroundColor: colors.theme.mutedBlue,
            borderColor: colors.theme.blue,
            pointRadius: 5,
            pointHoverRadius: 10,
            pointHitRadius: -1,

        }]
    };

    // create a separate object to hold additional chart configuration (inherits from colors object)
    let config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            legend: {
                display: false
            },
            scales: {
                yAxes: [{
                    scaleLabel: {
                        display: true,
                        labelString: 'flow (cubic ft/sec)'
                    },
                    ticks: {
                        fontColor: colors.neutral.bright
                    },
                    gridLines: {
                        color: colors.neutral.light
                    }
                }],
                xAxes: [{
                    ticks: {
                        fontColor: colors.neutral.bright
                    },
                    gridLines: {
                        color: colors.neutral.light
                    }
                }]
            },
            title: {
                display: true,
                text: [
                    `${formatTitleCase(siteData.name)} | ${flowRates[6]} cf/s`
                ],
                fontColor: colors.neutral.bright
            }
        }
    };

    // BOOM
    let myChart = new Chart(ctx, config)

    return myChart
}


function formatTitleCase(str) {
    /**
     * makes titles more pretty by modifying the case, except prepositions
     * @param {string} str the string to reformat
     */

    // words to keep lower
    const lowerCaseWords = ["near", "at", "in", "above", "below", "by"];
    const words = str.toLowerCase().split(" ");

    // Do The Magic Stuff
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (!lowerCaseWords.includes(word)) {
            words[i] = word.charAt(0).toUpperCase() + word.slice(1);
        } else {
            words[i] = word.toLowerCase();
        }
    }

    // put them back together
    const result = words.join(" ");

    // handling for ugly OR suffix
    if (result.toLowerCase().endsWith(", or")) {
        return result.slice(0, -4);
    } else if (result.toLowerCase().endsWith(",or")) {
        return result.slice(0, -3);
    } else {
        return result
    }
}

function toggleGraph(boxId, buttonId) {
    /**
     * toggle the graph visibility and update the button's icon
     * @param {str} boxId the id of the element whose visibility needs toggling
     * @param {str} buttonId the id of the button whose style needs updating 
     */

    el = document.getElementById(boxId) //access chart container
    bt = document.getElementById(buttonId) //access button element
    img = bt.children[0] //assumes btton has an image

    // handle screen dimension stuff, so that the chart doesn't swallow the whole page
    if (window.innerHeight <= window.innerWidth) {
        // if the screen is square or landscape, don't let the chart get wider than half the screen
        chartEl.parentElement.parentElement.style.maxWidth = '50vw'
    } else {
        // if the screen is mobile, center the chart at the bottom of the screen
        chartEl.parentElement.parentElement.style.maxWidth = null
    }

    // if the graph is currently hidden...
    if (el.style.opacity != '1') {

        // reveal graph
        el.style.display = 'flex'

        // update its opacity
        el.style.opacity = '1'

        // change symbology of its icon
        img.style.rotate = '45deg'
        img.style['background-image'] = 'url(./img/plus.svg)'


        // otherwise...
    } else if (el.style.opacity != '0') {
        el.style.opacity = '0' //hide it
        bt.style.display = 'block'
        img.style.rotate = '0deg' // rotate the button
        img.style['background-image'] = 'url(./img/graph.svg)' //change its image to a graph

        //ensure the opacity fade ends before the visibility changes 
        setTimeout(
            () => { el.style.display = 'none'; }, 300
        )
    } else {
        // hasn't happened
        console.log('unhandled logic in toggleGraph()')
    }

};

function toggleInfo(boxId, buttonId) {
    /**
     * toggle the info panel's visibility and update the button's icon
     * @param {str} boxId the id of the element whose visibility needs toggling
     * @param {str} buttonId the id of the button whose style needs updating 
     */
    // TODO: this function can be united with toggleGraph, if more params are added
    

    el = document.getElementById(boxId) //access info container
    bt = document.getElementById(buttonId) //access button element
    img = bt.children[0] //assumes btton has one image

    // if the info panel is currently hidden...
    if (el.style.opacity != '1') {

        // reveal it
        el.style.display = 'flex'

        // update its opacity
        el.style.opacity = '1'

        // change symbology of its icon
        img.style.rotate = '45deg'
        img.style['background-image'] = 'url(./img/plus.svg)'


        // otherwise...
    } else if (el.style.opacity != '0') {
        el.style.opacity = '0' //hide it
        bt.style.display = 'block'
        img.style.rotate = '0deg' // rotate the button
        img.style['background-image'] = 'url(./img/info.svg)' //change its image to a graph

        //ensure the opacity fade ends before the visibility changes 
        setTimeout(
            () => { el.style.display = 'none'; }, 300
        )
    } else {
        console.log('unhandled logic in toggleInfo()')
    }

};

function renderLink(e, id, text = 'view source') {
    /**
     * renders a link to the USGS viewer for the given gauge
     * @param e the element designated to contain the link 
     * @param id the stream gauge ID 
     * @param text the text to display in the hyperlink
     */
    linkTag = `<a id="link" href="https://waterdata.usgs.gov/monitoring-location/${id}/#parameterCode=00060&period=P7D" target="_blank" rel="noopener noreferrer">${text}</a>`
    e.innerHTML = linkTag
};