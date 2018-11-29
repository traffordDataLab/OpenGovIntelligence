/*
    Created:        2018/10/04 by James Austin - Trafford Data Lab
    Purpose:        Provides a signposting facility to services related to worklessness within Greater Manchester. Developed for the opengovintelligence project (http://www.opengovintelligence.eu) with EU funding and co-created with the Department for Work and Pensions. Uses software developed outside of the opengovintelligence project.
    Dependencies:   Leaflet.js - (C) Vladimir Agafonkin http://leafletjs.com
                    Leaflet.awesome-markers.js - Lennard Voogdt https://github.com/lvoogdt/Leaflet.awesome-markers
                    Leaflet.Locate plugin - (C) Dominik Moritz https://github.com/domoritz/leaflet-locatecontrol
                    Leaflet.markercluster.js - (C) Dave Leaver https://github.com/danzel
                    Leaflet.Control.Geocoder.js - (C) Per Liedman https://github.com/perliedman/leaflet-control-geocoder
                    Fontawesome - (C) Fonticons, Inc. All rights reserved https://fontawesome.com
                    All other code by Trafford Data Lab

    Licence:        Leaflet: https://github.com/Leaflet/Leaflet/blob/master/LICENSE
                    Leaflet.awesome-markers: https://github.com/lvoogdt/Leaflet.awesome-markers/blob/2.0/develop/LICENSE
                    Leaflet.Locate: https://github.com/domoritz/leaflet-locatecontrol/blob/gh-pages/LICENSE
                    Leaflet.markercluster: https://github.com/Leaflet/Leaflet.markercluster/blob/master/MIT-LICENCE.txt
                    Leaflet.Control.Geocoder: https://github.com/perliedman/leaflet-control-geocoder/blob/master/LICENSE
                    Fontawesome: https://fontawesome.com/license
                    Trafford Data Lab: https://github.com/traffordDataLab/opengovintelligence/blob/master/LICENSE

    Notes:          Trafford Data Lab Leaflet.reachability plugin uses © Powered by openrouteservice https://openrouteservice.org/
*/

// ######### FUNCTIONS #########
// To setup each feature within GeoJSON
function featureEvents (feature, layer) {
    // we need to discover the feature type - remember it is valid for this to be null!
    if (feature.hasOwnProperty('type')) {
        featureType = feature.type.toLowerCase();

        if (featureType == 'feature' || featureType == 'featurecollection') {
            if (feature.hasOwnProperty('geometry') && feature.geometry.hasOwnProperty('type')) featureType = (feature.geometry.type !== null) ? feature.geometry.type.toLowerCase() : null;
        }
    }

    // based on the feature type we now need to set the correct layer type
    if (featureType == 'point' && feature.hasOwnProperty('properties') && feature.properties.hasOwnProperty('featureRadius') && feature.properties.featureRadius !== '') {
        layer.type = 'circle';  // special case as there is no circle in GeoJSON - therefore we can only distinguish between a circle and a point if we have a radius value
    }
    else if (featureType == 'point' || featureType == 'multipoint') {
        layer.type = 'marker';
    }
    else if (featureType == 'polygon' || featureType == 'multipolygon') {
        layer.type = 'polygon';
    }
    else if (featureType == 'linestring' || featureType == 'multilinestring') {
        layer.type = 'polyline';
    }
    else {
        layer.type = featureType;   // probably null
    }

    // Add handler to layer to show properties onclick
    layer.on({
        click: showLayerProps
    });
}

// This function is for styling non-point data. If it has internal styling properties use them, otherwise use a default
function styleOverlayData(feature) {
    var styles = {
        color: '#e24a90',
        fillColor: '#e24a90',
        opacity: 0.5,
        fillOpacity: 0.2
    };

    var props = feature.properties;
    if (props != null) {
        if (props['stroke'] != null) styles['color'] = props['stroke'];
        if (props['stroke-width'] != null) styles['weight'] = props['stroke-width'];
        if (props['stroke-opacity'] != null) styles['opacity'] = props['stroke-opacity'];
        if (props['fill'] != null) styles['fillColor'] = props['fill'];
        if (props['fill-opacity'] != null) styles['fillOpacity'] = props['fill-opacity'];
    }

    return styles;
}

// To setup any point data features within GeoJSON
function pointData (feature, latlng) {
    if (app.datasetCluster == null) {
        // create the marker cluster object in case we require this feature - also indicates to the application that we have point data in the dataset
        app.datasetCluster = L.markerClusterGroup({
            spiderLegPolylineOptions: { weight: 2, color: '#e24a90', opacity: 0.5 },
            polygonOptions: { weight: 2, color: '#e24a90', opacity: 0.5, dashArray: '5' }
        });
    }

    if (feature.hasOwnProperty('properties') && feature.properties.hasOwnProperty('featureRadius') && feature.properties.featureRadius !== '') {
        return L.circle(latlng, { radius: feature.properties.featureRadius });
    }
    else {
        return L.marker(latlng, { icon: app.marker });
    }
}

// Reset the styling of a previously selected feature
function resetFeatureStyle() {
    if (app.featureCache != null) {
        var layer = app.featureCache;

        if (layer.type == 'marker') {
            // Specific reset implementation for markers
            layer.setIcon(app.marker);
        }
        else if (isDatasetLayer(layer)) {
            // The feature belongs to a dataset that has been loaded
            app.datasetGeoJson.resetStyle(layer);
        }
        else if (isIsolineLayer(layer)) {
            // The feature is an isoline drawn with the reachability plugin
            app.reachabilityControl.isolinesGroup.resetStyle(layer);
        }
        else {
            // The feature is a polygon from a geography boundary. Easier to just set the style back to the default than resetting it via the L.geoJSON method
            layer.setStyle(app.poly);
        }

        app.featureCache = null; // clear the cache to prevent a situation where no feature is currently selected but the cache still contains the previously selected layer
    }
}

// Show the properties of a selected layer
function showLayerProps(e) {
    L.DomEvent.stopPropagation(e);  // stop the event bubbling to the map which would cause the information to be removed from the info panel etc.

    var layer = e.target;
    var propsTable = '';

    // reset the style of a previously selected feature
    resetFeatureStyle();

    // add new selected feature to the cache
    app.featureCache = layer;

    // set the highlight style of the selected feature
    if (layer.type == 'marker') {
        layer.setIcon(app.markerSelected);
    }
    else {
        layer.setStyle(app.polySelected);

        // Does the polygon layer belong to either a dataset or boundary geography? If so we want to bring that layer to the front
        // It's really important that we don't do this for isolines otherwise the user couldn't select intervals
        if (isIsolineLayer(layer) == false) layer.bringToFront();
    }

    // build the content for the properties table to be displayed
    if (layer.feature.hasOwnProperty('properties')) {
        var props = layer.feature.properties;
        var propVal, prefix;
        var matchIndex = 0;
        var arrEmail = [];

        for (var key in props) {
            // Ensure that the key is a valid property of the GeoJson object and isn't one of the styling options
            if (props.hasOwnProperty(key) && key != 'stroke' && key != 'stroke-width' && key != 'stroke-opacity' && key != 'fill' && key != 'fill-opacity' && key != 'marker-color' && key != 'marker-size') {
                if (props[key] === null || props[key] === undefined || props[key] !== props[key]) {     // The strange test of the property value not equalling itself is for NaN as NaN, uniquely, is never equal to itself
                    propsVal = '';
                }
                else if (isNaN(props[key])) {   // Given that we have screened out the possibility of props[key] being NaN, this test is to check if props[key] is numeric or not. If it is numeric we don't want to perfom regex on it
                    /*
                        To enhance usability turn email or web addresses found within the property value into hyperlinks. Works for single or multiple occurrences

                        NOTE:
                            - For efficiency this is done here each time the user selects a feature, rather than on the whole dataset when it is loaded. It is likely only a few features will be selected by the user.
                            - Not claiming to match every occurrence, but a high proportion.  There will always be ones that slip through, but this is an enhancement feature rather than a validation so isn't an issue.
                            - The method of pushing the matching email addresses to an array, substituting an indexed string then replacing with the HTML link is done to prevent the second regex matching the domain parts of email addresses or parts of the href property etc.
                            - Regex obtained from: https://emailregex.com and http://urlregex.com
                    */

                    // Find email addresses
                    propsVal = props[key].replace(/[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*/gi, function (x) {
                        arrEmail.push('<a href="mailto:' + x + '">' + x + '</a>');
                        return '@@@EMAIL' + matchIndex++ + '@@@';   // replace with a temporary placeholder to prevent the web address regex matching part of the email addresses as well
                    });

                    // Find URLs - NOTE: we need to replace the value of propsVal NOT props[key] as we might have properties with a mix of email and web addresses
                    propsVal = propsVal.replace(/\b(<a href=")?(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?\b/gi, function (x) {
                        var prefix = (x.indexOf('http://') > -1 || x.indexOf('https://') > -1) ? '' : 'http://';     // if the URL doesn't contain the protocol we'll assume http://
                        return '<a href="' + prefix + x + '" target="_blank">' + x + '</a>';
                    });

                    // Finally replace all email addresses found
                    for (var i = 0; i < arrEmail.length; i++) {
                        propsVal = propsVal.replace('@@@EMAIL' + i + '@@@', arrEmail[i]);
                    }
                }
                else {
                    // Value seems to be a number so just display it
                    propsVal = props[key];
                }

                propsTable += '<tr><td>' + key + '</td><td>' + propsVal + '</td></tr>';
            }
        }

        if (propsTable != '') app.updateInfo('<table class="propertiesTable">' + propsTable + '</table>');
    }
}

// for loading data as an overlay layer
function loadDatasetLayer(datasetKey) {
    // Remove any current data layer and reset the variables
    if (app.datasetLayer !== null) {
        app.datasetLayer.removeFrom(app.map);
        app.attribution.removeAttribution(app.datasetGeoJson.getAttribution());   // have to remove the attribution manually due to a seeming bug in Leaflet.MarkerCluster not handling it automatically

        app.datasetLayer = null;
        app.datasetGeoJson = null;
        app.datasetCluster = null;

        // ensure the cluster checkbox is hidden
        if (L.DomUtil.hasClass(app.toggleClusterContainer, 'hideContent') == false) L.DomUtil.addClass(app.toggleClusterContainer, 'hideContent');

        // reset the info panel if a feature from the previous dataset was selected
        if (app.featureCache != null && isGeographyLayer(app.featureCache) == false && isIsolineLayer(app.featureCache) == false) {
            app.updateInfo();
            app.featureCache = null;
        }

        // reset the legend panel
        app.updateLegend();
    }

    // Check to see if the dataset key we've been given matches any datset objects
    if (app.objDatasets.hasOwnProperty(datasetKey)) {
        // Set the page title to match the dataset title.
        document.title = 'Signpost: ' + app.objDatasets[datasetKey].title;

        // Update the about section
        app.updateAbout(app.objDatasets[datasetKey].about);

        startLabSpinner()  // inform the user that something is loading

        // Attempt to load GeoJSON specified in the URL
        labAjax(app.objDatasets[datasetKey].url, function (data) {
            if (data !== null && data !== '') {
                try {
                    // set the options for the GeoJSON layer
                    var layerOptions = { style: styleOverlayData, onEachFeature: featureEvents, pointToLayer: pointData, pane: 'pane_data_overlay' };
                    if (app.objDatasets[datasetKey].attribution !== null) layerOptions['attribution'] = 'Data source: ' + app.objDatasets[datasetKey].attribution;

                    app.datasetGeoJson = L.geoJSON(data, layerOptions);     // create and store the GeoJSON object

                    // do we have point data in the dataset?
                    if (app.datasetCluster != null) {
                        app.datasetCluster.addLayer(app.datasetGeoJson);  // add the GeoJSON to the cluster object - point data will be clustered but polygons/lines won't

                        // the following is a patch for a seeming bug in Leaflet.MarkerCluster not handling the layer attribution automatically
                        if (app.objDatasets[datasetKey].attribution !== null) app.attribution.addAttribution('Data source: ' + app.objDatasets[datasetKey].attribution);

                        // do we want clustering on or off?
                        var clusterQS = labGetQryStrValByKey('cluster');

                        if (clusterQS === 'true' || (clusterQS !== 'false' && app.objDatasets[datasetKey].hasOwnProperty('cluster') && app.objDatasets[datasetKey].cluster === true)) {
                            app.datasetLayer = app.datasetCluster;    // the layer we are going to add to the map is the clustered version
                            document.getElementById('toggleClustering').checked = true;
                        }
                        else {
                            app.datasetLayer = app.datasetGeoJson;    // the layer we are going to add to the map is the straight GeoJSON we loaded
                            document.getElementById('toggleClustering').checked = false;
                        }

                        L.DomUtil.removeClass(app.toggleClusterContainer, 'hideContent');    // show the clustering checkbox
                    }
                    else {
                        app.datasetLayer = app.datasetGeoJson;    // the layer we are going to add to the map is the straight GeoJSON we loaded
                    }

                    // add the dataset layer to the map
                    app.datasetLayer.addTo(app.map);

                    // add legend content if applicable
                    if (app.objDatasets[datasetKey].hasOwnProperty('legend') && app.objDatasets[datasetKey].legend != null && app.objDatasets[datasetKey].legend !== '') app.updateLegend(app.objDatasets[datasetKey].legend);
                }
                catch (e) {
                    labError(new LabException("Error attempting to create GeoJSON Leaflet layer: " + e.message));
                }
            }
            else {
                labError(new LabException("Couldn't find URL: " + app.objDatasets[datasetKey].url));
            }

            stopLabSpinner()   // remove the spinner as the data has loaded
        });
    }
    else {
        // No dataset found so reset the map to the initial state
        document.title = app.title;
        app.updateAbout(app.about);
    }
}

// Handles clustering and de-clustering of point data - called via click event on clustering checkbox
function toggleClustering() {
    app.datasetLayer.removeFrom(app.map);

    if (document.getElementById('toggleClustering').checked) {
        app.datasetLayer = app.datasetCluster;    // the layer we are going to add to the map is the clustered version
    }
    else {
        app.datasetLayer = app.datasetGeoJson;    // the layer we are going to add to the map is the straight GeoJSON we loaded
    }

    app.datasetLayer.addTo(app.map);
}

// Determines whether the layer provided is an isoline - created by the reachability plugin
function isIsolineLayer(layer) {
    if (app.reachabilityControl != null && app.reachabilityControl.isolinesGroup != null) {
        /*
            The following iteration is seemingly required as the expected code: app.reachabilityControl.isolinesGroup.hasLayer(layer) doesn't work.
            Each isoline or set of isolines (if intervals were created) are added to .isolinesGroup as a L.geoJSON object, thus they are effectively sub groups of .isolinesGroup.
            The loop iterates through each sub group and checks if the layer is present. If so we stop checking.
        */
        var arrGroups = app.reachabilityControl.isolinesGroup.getLayers();
        for (var i = 0; i < arrGroups.length; i++) {
            if (arrGroups[i].hasLayer(layer)) return true;
        }
    }

    return false;
}

// Determines whether the layer provided is a geography boundary
function isGeographyLayer(layer) {
    for (key in app.objGeographies) {
        if (app.objGeographies[key].hasLayer(layer)) return true;
    }

    return false;
}

// Determines whether the layer provided is a dataset layer
function isDatasetLayer(layer) {
    return (app.datasetLayer != null && app.datasetLayer.hasLayer(layer));
}




// ######### INITIALISATION #########
// Set up the basic map environment
var app = new LabLeafletMap({
    title: 'Signpost',
    about: 'Find services relating to worklessness within Greater Manchester.<br /><br />For guidance on using this app please refer to the <a href="http://www.trafforddatalab.io/opengovintelligence/documentation/signpost_README.html" target="_blank">documentation</a>.<br /><br /><img src="eu_flag.png" width="50" alt="Flag of the European Union" style="float: left; margin-right: 6px; margin-top: 7px;"/> <span class="fundingInfo">Funded by the EU\'s Horizon 2020 programme, grant No 693849.</span><br /><br />Discover more about the <a href="http://www.trafforddatalab.io/opengovintelligence/" target="_blank">Trafford Worklessness Pilot</a>.'
});
app.layerControl.remove();   // remove the layer control as it is not required
app.baseLayers['Low detail'].addTo(app.map);   // Choose the base/tile layer for the map


// Add the Leaflet Control Geocoder by perliedman
app.geocoder = L.Control.geocoder({
    position: 'topleft',
    defaultMarkGeocode: false,
    placeholder: 'Search town, road, postcode...',
    errorMessage: 'Sorry, nothing found.',
    expand: 'click',
    geocoder: L.Control.Geocoder.nominatim({
        geocodingQueryParams: { countrycodes: 'gb' }    // limit searches to UK
    })
}).addTo(app.map);

// Access the icon element within the plugin to replace the default graphics with a Font Awesome icon
app.geocoderIcon = document.getElementsByClassName('leaflet-control-geocoder-icon')[0];
app.geocoderIconClass = 'fa-search';
while (app.geocoderIcon.firstChild) {
    app.geocoderIcon.removeChild(app.geocoderIcon.firstChild);  // remove any child nodes, such as the &nbsp; char added by the plugin
}
L.DomUtil.addClass(app.geocoderIcon, 'fa ' + app.geocoderIconClass);

// Events to add and remove the spinner class from the geocoder control
app.geocoder.on('startgeocode', function () {
    L.DomUtil.removeClass(app.geocoderIcon, app.geocoderIconClass);
    L.DomUtil.addClass(app.geocoderIcon, 'fa-spinner');
    L.DomUtil.addClass(app.geocoderIcon, 'fa-pulse');
});
app.geocoder.on('finishgeocode', function () {
    L.DomUtil.removeClass(app.geocoderIcon, 'fa-spinner');
    L.DomUtil.removeClass(app.geocoderIcon, 'fa-pulse');
    L.DomUtil.addClass(app.geocoderIcon, app.geocoderIconClass);
    app.geocoder._collapse();
});

// prevent a standard marker being placed at the search location, create a custom one instead
app.geocoder.on('markgeocode', function(result) {
    result = result.geocode || result;
    app.map.fitBounds(result.bbox); // zoom to the bounds of the result area

    // remove current marker if it exists and create a new marker
    if (app.geocoderMarker != null && app.map.hasLayer(app.geocoderMarker)) app.map.removeLayer(app.geocoderMarker);
    app.geocoderMarker = new L.Marker(result.center, { icon: L.divIcon({ className: 'fa fa-location-arrow geocoderMarker' }) })
        .bindPopup(result.html || result.name, { offset: L.point(14, 0) })
        .addTo(app.map)
        .openPopup();
});


// Add the reachability plugin
app.reachabilityControl = L.control.reachability({
    // Common options are taken care of in the function, however the options below are extra
    apiKey: '58d904a497c67e00015b45fc6862cde0265d4fd78ec660aa83220cdb',
    ajaxRequestFn: labAjax,
    expandButtonStyleClass: 'reachability-control-expand-button fa fa-bullseye',
    expandButtonContent: '',
    collapseButtonContent: '',
    collapseButtonStyleClass: 'reachability-control-collapse-button fa fa-caret-up',
    drawButtonContent: '',
    drawButtonStyleClass: 'fa fa-pencil',
    deleteButtonContent: '',
    deleteButtonStyleClass: 'fa fa-trash',
    distanceButtonContent: '',
    distanceButtonStyleClass: 'fa fa-road',
    timeButtonContent: '',
    timeButtonStyleClass: 'fa fa-clock-o',
    drivingButtonContent: '',
    drivingButtonStyleClass: 'fa fa-car',
    cyclingButtonContent: '',
    cyclingButtonStyleClass: 'fa fa-bicycle',
    walkingButtonContent: '',
    walkingButtonStyleClass: 'fa fa-male',
    accessibilityButtonContent: '',
    accessibilityButtonStyleClass: 'fa fa-wheelchair-alt',
    markerFn: reachabilityMarker,
    styleFn: styleIsolines,
    clickFn: showLayerProps,
    pane: 'pane_geography_overlay'
}).addTo(app.map);

// Custom styling of the isolines polygons
function styleIsolines(feature) {
    return {
        color: '#212121',
        fillColor: '#757575',
        opacity: 0.8,
        fillOpacity: 0.1,
        weight: 4,
        dashArray: '1,6',
        lineCap: 'square'
    };
}

// Custom markers to appear at the origin of the isolines
function reachabilityMarker(latLng, travelMode, measure) {
    var faClass;

    switch (travelMode) {
        case 'driving-car':
            faClass = 'fa fa-car'
            break;
        case 'cycling-regular':
            faClass = 'fa fa-bicycle'
            break;
        default:
            faClass = 'fa fa-male'
    }

    var customIcon = L.divIcon({ className: faClass + ' lab-reachability-marker', iconAnchor: [12, 12] });

    return L.marker(latLng, { icon: customIcon });
}


app.datasetGeoJson = null;       // object to store GeoJSON created from datasets loaded from the select list. ***NOTE*** this object is important for the resetting of styles for clusered marker datasets
app.datasetCluster = null;       // object to store a leaflet.markercluster object - created if the dataset contains point data
app.datasetLayer = null;         // either a copy of app.datasetGeoJson or app.datasetCluster containing app.datasetGeoJson layers - depends on whether we are clustering point data or not
app.featureCache = null;         // for caching the currently selected feature
app.endpoint = 'http://cubiql.gmdatastore.org.uk/graphql?query=';

// Polygon feature styling
app.poly = {
    color: '#212121',
    weight: 2,
    fillOpacity: 0
};

// Selected polygon styling
app.polySelected = {
    color: '#e24a90',
    weight: 5,
    opacity: '1'
};

// Point data feature styling
app.marker = L.AwesomeMarkers.icon({
    markerColor: 'pin-circle-pink-dark',
    iconSize: [20, 39]
});

// User-selected point data styling
app.markerSelected = L.AwesomeMarkers.icon({
    markerColor: 'pin-circle-pink-bright',
    iconSize: [20, 39]
});


// ######### EVENTS #########
// Reset the map state if any features have been selected
app.map.on('click', (function (e) {
    resetFeatureStyle();    // reset the style of a previously selected feature
    app.updateInfo();    // clear and hide the info panel
}));

app.map.on('reachability:api_call_start', function (e) {
    // indicate to the user that something is happening at the start of the API call
    startLabSpinner();
});

app.map.on('reachability:api_call_end', function (e) {
    // stop the spinner at the end of the API call
    stopLabSpinner();
});

app.map.on('reachability:delete', function (e) {
    // Check that the recently deleted isoline wasn't currently selected
    if (app.featureCache != null) {
        var layer = app.featureCache;

        if (isIsolineLayer(layer) == false && isGeographyLayer(layer) == false && isDatasetLayer(layer) == false) {
            // The currently cached layer must've been an isoline which has now been deleted so reset the info panel and cache
            app.updateInfo();
            app.featureCache = null;
        }
    }
});


// ######### DATASET METADATA & SELECTION UI  #########
labAjax('apps/signpost/datasets.json', function (data) {
    // Load the JSON holding the metadata for all the datasets which we visualise in the app. The data is in the form:
    /*
    "": {
        "title": "",
        "about": "",
        "attribution": "",
        "url": "",
        "theme": "",
        "cluster": true,    // OPTIONAL
        "hidden": true,     // OPTIONAL
        "legend": ""        // OPTIONAL
    }
    */
    app.objDatasets = data;  // store the dataset data

    var arrSelectList = [];     // array to hold the contents of the select list to choose the dataset to visualise

    // Loop through the app.objDatasets object adding the main key, title and theme to the array so long as the key is a dataset and we don't want it hidden
    for (key in app.objDatasets) {
        if (app.objDatasets.hasOwnProperty(key) && (!app.objDatasets[key].hasOwnProperty('hidden') || (app.objDatasets[key].hasOwnProperty('hidden') && app.objDatasets[key].hidden !== true))) {
            arrSelectList.push({ dataset: key, title: app.objDatasets[key].title, theme: app.objDatasets[key].theme });
        }
    }

    // Sort the select list array by the themes first as these form the optgroup headings, then by the dataset titles
    arrSelectList.sort(function(a, b) {
        var themeA = a.theme.toLowerCase();
        var themeB = b.theme.toLowerCase();
        var titleA = a.title.toLowerCase();
        var titleB = b.title.toLowerCase();

        // attempt sorting by theme first
        if (themeA < themeB) return -1;
        if (themeA > themeB) return 1;

        // if the theme is the same, sort by the title
        if (titleA < titleB) return -1;
        if (titleA > titleB) return 1;
        return 0;
    });

    // Check the URL for a dataset key in the Query String
    var datasetQS = labGetQryStrValByKey('dataset');

    // Create the select element to choose the app.objDatasets
    var datasetSelect = '<select name="frmDatasetList" onChange="loadDatasetLayer(this.value)" class="datasetSelect"><option value="" selected="selected">Select a service to display...</option>';

    var optGroupTheme = '';     // ensure we create new optgroup tags based on the themes

    for (var i = 0; i < arrSelectList.length; i++) {
        /* COMMENTED OUT AS WE DON'T WANT THEMES
        // Write out new optgroup tag
        if (optGroupTheme != arrSelectList[i].theme) {
            if (optGroupTheme != '') datasetSelect += '</optgroup>';
            datasetSelect += '<optgroup label="' + arrSelectList[i].theme + '">';
            optGroupTheme = arrSelectList[i].theme;
        }
        */

        // Write out the dataset list
        datasetSelect += '<option value="' + arrSelectList[i].dataset + '"';
        if (datasetQS == arrSelectList[i].dataset) datasetSelect += ' selected="selected"';
        datasetSelect += '>' + arrSelectList[i].title + '</option>';
    }

    //datasetSelect += '</optgroup></select>';  COMMENTED OUT AS WE DON'T WANT THEMES
    datasetSelect += '</select>';

    // Add the dataset chooser UI to the filter container along with the element to toggle point data clustering
    app.updateFilterGUI(datasetSelect + '<div id="toggleClusteringContainer" class="hideContent"><input type="checkbox" id="toggleClustering" onClick="toggleClustering()"/><label for="toggleClustering" class="toggleCluster">cluster markers</label></div>');

    // Store a reference to the container for the point data clustering control so that we can show/hide by adding or removing a CSS class
    app.toggleClusterContainer = document.getElementById('toggleClusteringContainer');

    // If a dataset has been specified via the QueryString, attempt to load it
    if (datasetQS !== null) loadDatasetLayer(datasetQS);
});


// ######### SPATIAL GEOGRAPHY LAYERS/LABELS #########
app.objGeographies = {};   // object to hold all the boundary L.geoJSON objects so that we can test in a loop for which layer belongs to which geography

// Add the LA boundaries within GM
startLabSpinner();
labAjax('https://www.trafforddatalab.io/spatial_data/local_authority/2016/gm_local_authority_full_resolution.geojson', function (laBoundariesData) {
    if (laBoundariesData != null) {

        // Prepare the cubiql query
        var query  = '{';
            query += '   cubiql {';
            query += '      dataset_working_age_population {';
            query += '          observations {';
            query += '              page(first: 2000) {';
            query += '                  next_page';
            query += '                  observation {';
            query += '                      reference_area {';
            query += '                          label';
            query += '                      }';
            query += '                      count';
            query += '                  }';
            query += '              }';
            query += '          }';
            query += '      },';
            query += '      dataset_claimant_rate {';
            query += '          observations(dimensions:{reference_period:{uri:"http://reference.data.gov.uk/id/month/2018-09"}}) {';
            query += '              page(first: 2000) {';
            query += '                  next_page';
            query += '                  observation {';
            query += '                      reference_area {';
            query += '                          label';
            query += '                      }';
            query += '                      percent';
            query += '                  }';
            query += '              }';
            query += '          }';
            query += '      }';
            query += '   }';
            query += '}';

        // GET cubiql request
        labAjax(app.endpoint + encodeURIComponent(query), function (dataFromEndpoint) {
            if (dataFromEndpoint != null) {
                // Extract the observations array from the JSON
                var arrWorkAgeObs = dataFromEndpoint.data.cubiql.dataset_working_age_population.observations.page.observation;
                var arrClaimantRateObs = dataFromEndpoint.data.cubiql.dataset_claimant_rate.observations.page.observation;

                // Create a new JSON data structure to store the results of the cubiql query in the form: { "area_reference": count } to allow easy binding to the geography GeoJSON properties
                var objObs = {
                    'working_age_population': {},
                    'claimant_rate': {}
                };

                // Working age population
                for (var i = 0; i < arrWorkAgeObs.length; i++) {
                    objObs['working_age_population'][arrWorkAgeObs[i].reference_area.label] = arrWorkAgeObs[i].count;
                }

                // Claimant rate
                for (var i = 0; i < arrClaimantRateObs.length; i++) {
                    objObs['claimant_rate'][arrClaimantRateObs[i].reference_area.label] = arrClaimantRateObs[i].percent;
                }
            }

            // Rename the property variables in the GeoJson for clarity
            // This happens even if we don't get data from the endpoint, however if we have data, bind this also to the properties
            for (var i = 0; i < laBoundariesData['features'].length; i++) {
                var newProps = {
                    'LA code': laBoundariesData['features'][i].properties.area_code,
                    'LA name': laBoundariesData['features'][i].properties.area_name
                };

                // If we have the working age population data, format the number with commas and add to the new properties list
                if (dataFromEndpoint != null) {
                    newProps['Working age population'] = objObs['working_age_population'][newProps['LA code']].toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                    newProps['Claimant rate (%)'] = objObs['claimant_rate'][newProps['LA code']];
                }

                laBoundariesData['features'][i].properties = newProps;
            }

            app.objGeographies['LA'] = L.geoJSON(laBoundariesData, { attribution: app.attributionOS, style: app.poly, onEachFeature: featureEvents }).addTo(app.map);
            app.map.fitBounds(app.objGeographies['LA'].getBounds()); // adjust the zoom to fit the boundary to the screen size

            stopLabSpinner();
        });
    }
    else {
        stopLabSpinner();
    }
});
