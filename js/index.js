mapboxgl.accessToken = 'pk.eyJ1Ijoic2FtZ2FydHJlbGwiLCJhIjoiY2w3OWt3MW00MDNjbDN2cGRpc20ya3JnbyJ9.6t2ISNlyP1BvBmkSH2Ks_Q';
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

// manually add a custom graph toggle to the right control group div
const rightCtrlGroup = document.getElementsByClassName('mapboxgl-ctrl-top-right')[0];
const graphCtrl = document.createElement('div');
graphCtrl.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

graphCtrl.innerHTML = `
    <button id='toggleGraph' role="button" onclick="toggle('media-box', 'toggleGraph')">
    <svg class="icon"></svg>
    </button>
`;
rightCtrlGroup.appendChild(graphCtrl);

// Data for gauge points:
var endpoint = `https://waterservices.usgs.gov/nwis/iv/?format=json&indent=on&stateCd=or&${formatDateStamp(0)}&parameterCd=00060&siteStatus=active`
console.log(endpoint)

// send api request
fetch(endpoint)
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
                    // .setPopup(popup)

                    let element = marker.getElement()
                    element.setAttribute('siteid', `${g.id}`)
                    element.setAttribute(
                        'onClick', "passID(this)"
                    );
                } catch (error) {
                    console.log(`error:`, gauge, error)
                }
            }
        }
        )
    }
    );

// retrieve data for last 7 days and restructure to be ingestible by renderChart()
// an array of promises is also returned, in case the requests are still executing
// eventually, put this in a timeout loop that runs every hour or something
const structuredData = retrieveData()
console.log(structuredData)

// CHART
const chartEl = document.getElementById('line-canvas')
const linkEl = document.getElementById('usgs-link')

// Options for the observer (which mutations to observe)
const config = { attributes: true, childList: false, subtree: false };

// Callback function to execute when mutations are observed
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
                ReferenceError
            } finally {
                if (structuredData[siteId] != undefined) {
                    // handle mobile/pc screen dimension stuff
                    if (window.innerHeight <= window.innerWidth) {
                        chartEl.parentElement.parentElement.style.maxWidth = '50vw'
                    } else {
                        chartEl.parentElement.parentElement.style.maxWidth = null
                    }

                    chrt = renderChart(chartEl, structuredData[siteId], autoShow = true);
                    renderLink(linkEl, siteId, text = 'view USGS graph')

                } else {
                    console.log('7 day history unavailable for this location')
                    //chart current values or something
                }
            }

        }
    }
};

// Create an observer instance linked to the callback function
const observer = new MutationObserver(callback);

// Start observing the target node for configured mutations
observer.observe(chartEl, config);

// close chart if map is clicked and a chart is showing. 
map.on('click', function (e) {
    console.log(e)
    chartBox = document.getElementById('line')
    console.log(chartBox)
    if (chartBox.style.opacity == 1) {
        toggle('media-box', 'toggleGraph')
    }
});

// observer.disconnect();

// FUNCS:
function formatDateStamp(daysAgo, hrWindow = 1) {
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

// color markers based on stream depth
function getMarkerColor(attributes) {
    if (attributes.depth < 2) {
        return 'green';
    } else if (attributes.depth < 4) {
        return 'yellow';
    } else {
        return 'red';
    }
};

// pass ID to chart element
function passID(e, chartEl = document.getElementById('line-canvas')) {
    id = e.getAttribute('siteid')
    chartEl.setAttribute('siteid', id)
    console.log(id)
};

function retrieveData() {
    /*
    Function to retrieve flow data for all stream gauges for the last 7 days, 
    then restructure the result into an object to be parsed by the graph function 
    Courtesy of ChatGPT.
    */

    const days = ['today', 'yesterday', '2daysago', '3daysago', '4daysago', '5daysago', '6daysago']; // this code is whack
    const results = {};

    // Create an array of promises
    const promises = days.map((day, i) => {
        const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&indent=on&stateCd=or&${formatDateStamp(i)}&parameterCd=00060&siteStatus=active`; // eventually, manipulate this code to make actual requests. starting with 0 days ago (not 1, as here)
        return fetch(url).then(response => response.json());
    });

    // Wait for all promises to resolve before continuing
    Promise.all(promises).then(data => {
        data.forEach(json => {
            const timeSeries = json.value.timeSeries;
            for (let j = 0; j < timeSeries.length; j++) {
                const siteCode = timeSeries[j].sourceInfo.siteCode[0].value;
                const siteName = timeSeries[j].sourceInfo.siteName;

                if (!results[siteCode]) {
                    results[siteCode] = {
                        name: siteName,
                        readings: {}
                    };
                }
                try {
                    // changed to "let" to enable error recovery
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
        console.error(error);
    });
    return results
}

function renderChart(e, siteData, autoShow = false, btn = document.getElementById('toggleGraph')) {
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

    const labels = [
        "last week",
        "6 days ago",
        "5 days ago",
        "4 days ago",
        "3 days ago",
        "yesterday",
        "today",
    ];

    let flowRates = [];

    for (let i = 1; i <= 7; i++) {
        vals = siteData["readings"][i];
        mean = vals.reduce(
            (acc, val) => acc + val, 0
        ) / vals.length;
        flowRates.push(
            Math.round(mean, 0),
        )

    }

    // reverse flow rates to put the sequence of readings in chronological order
    flowRates = flowRates.reverse()

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

    let myChart = new Chart(ctx, config)

    return myChart
}


function formatTitleCase(str) {
    // this function makes titles more pretty by modifying the case
    const lowerCaseWords = ["near", "at", "in", "above", "below", "by"];
    const words = str.toLowerCase().split(" ");

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (!lowerCaseWords.includes(word)) {
            words[i] = word.charAt(0).toUpperCase() + word.slice(1);
        } else {
            words[i] = word.toLowerCase();
        }
    }

    const result = words.join(" ");

    if (result.toLowerCase().endsWith(", or")) {
        return result.slice(0, -4);
    } else if (result.toLowerCase().endsWith(",or")) {

    } else {
        return result
    }
}

function toggle(boxId, buttonId) {
    // toggles visibility style prop of an element identified by boxId

    el = document.getElementById(boxId)
    bt = document.getElementById(buttonId)
    img = bt.children[0] //assumes btton has an image

    // handle screen dimension stuff
    if (window.innerHeight <= window.innerWidth) {
        chartEl.parentElement.parentElement.style.maxWidth = '50vw'
    } else {
        chartEl.parentElement.parentElement.style.maxWidth = null
    }


    // if the graph is currently hidden...
    if (el.style.opacity != '1') {

        // reveal graph
        el.style.display = 'flex'

        // update its opacity
        el.style.opacity = '1'

        // change symbology of icon
        img.style.rotate = '45deg'
        img.style['background-image'] = 'url(./img/plus.svg)'


        // otherwise...
    } else if (el.style.opacity != '0') {
        el.style.opacity = '0'
        bt.style.display = 'block'
        img.style.rotate = '0deg'
        img.style['background-image'] = 'url(./img/graph.svg)'

        //ensure the opacity fade ends before the visibility changes 
        setTimeout(
            () => { el.style.display = 'none'; }, 300
        )
    } else {
        console.log('WHAT')
    }

};

function renderLink(e, id, text = 'view source') {
    // renders a link to the USGS viewer for the given gauge
    linkTag = `<a id="link" href="https://waterdata.usgs.gov/monitoring-location/${id}/#parameterCode=00060&period=P7D" target="_blank" rel="noopener noreferrer">${text}</a>`
    e.innerHTML = linkTag
};