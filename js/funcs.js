export function formatDateStamp(daysAgo, hrWindow=1) {   
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
export function getMarkerColor(attributes) {
    if (attributes.depth < 2) {
        return 'green';
    } else if (attributes.depth < 4) {
        return 'yellow';
    } else {
        return 'red';
    }
};

// pass ID to chart element
export function passID(e, chartEl = document.getElementById('line-canvas')) {
    id = e.getAttribute('siteid')
    chartEl.setAttribute('siteid', id)
    console.log(id)
};


// panel selection function. opens or closes the panel (manipulates css height prop) depending on its current state, when clicked.
// changes the icon! points the glyph at one of two chevrons
export function panelSelect(e) {
    console.log(e) //note that "e" represents the 
    //               ELEMENT in which this function was called, 
    //               since we put "this" inside the () when
    //               calling the funciton
    if (state.panelOpen) {
        document.getElementById('chartPanel').style.height = '40px';
        document.getElementById('chartPanel').style.width = '40px';
        document.getElementById('chartPanel').style.bottom = '5%';
        document.getElementById('glyph').className = "chevron glyphicon glyphicon-chevron-up";
        document.getElementById('closer').style.height = "0px";
        document.getElementById('closer').style.width = "0px";
        state.panelOpen = false;
    } else {
        document.getElementById('chartPanel').style.height = '250px';
        document.getElementById('chartPanel').style.width = '90%';
        document.getElementById('chartPanel').style.bottom = '10%';
        document.getElementById('glyph').className = "chevron glyphicon glyphicon-chevron-down";
        document.getElementById('closer').style.height = "26px";
        document.getElementById('closer').style.width = "26px";
        state.panelOpen = true;
    }
    console.log(state)
}

export function retrieveData() {
    /*
    Function to retrieve flow data for all stream gauges for the last 7 days, 
    then restructure the result into an object to be parsed by the graph function 
    Courtesy of ChatGPT.
    */
    const days = ['today', 'yesterday', '2daysago', '3daysago', '4daysago', '5daysago', '6daysago'];
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

                const readings = timeSeries[j].values[0].value.map(v => parseFloat(v.value));
                const index = data.indexOf(json) + 1;
                results[siteCode].readings[index] = readings;
            }
        });

    }).catch(error => {
        console.error(error);
    });
    return results
}

export function renderChart(e, siteData) {
    var ctx = e.getContext("2d");

    // gradient fill
    let gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0.3, 'rgba(60,50,40,0.5)'); // top of chart
    gradient.addColorStop(1, 'rgba(0,170,190,0.4)'); // bottom of chart

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

    // wait for the data to finish cooking before doing any chart stuff with it
    console.log('site data');
    for (let i = 1; i <= 7; i++) {
        vals = siteData["readings"][i];
        mean = vals.reduce(
            (acc, val) => acc + val, 0
        ) / vals.length;
        flowRates.push(mean)

    }

    console.log(flowRates)

    let data = {
        labels,
        datasets: [{
            data: flowRates,
            label: siteData.name,
            fill: true,
            backgroundColor: gradient,
            borderColor: "#FFF",
            pointRadius: 5,
            pointHoverRadius: 10,
            pointHitRadius: -1
        }]
    };

    let config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            scales: {
                yAxes: [{
                    scaleLabel: {
                        display: true,
                        labelString: 'flow (cubic ft/sec)'
                    }
                }]
            }
        }
    };

    let myChart = new Chart(ctx, config)

    return myChart
}
