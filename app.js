// DOM Elements
const modal = document.getElementById('token-modal');
const tokenInput = document.getElementById('token-input');
const saveTokenBtn = document.getElementById('btn-save-token');
const statusText = document.getElementById('status-text');
const pulseDot = document.querySelector('.pulse-dot');
const radarTimeEl = document.getElementById('radar-time');
const playBtn = document.getElementById('btn-play');
const slider = document.getElementById('radar-slider');
const gpsBtn = document.getElementById('btn-gps');
const currentRadarName = document.getElementById('current-radar-name');

// Sidebar Elements
const sidebarPanel = document.querySelector('.sidebar-panel');
const btnMobileMenu = document.getElementById('btn-mobile-menu');
const radarSourceSelect = document.getElementById('radar-source-select');
const opacityRadar = document.getElementById('opacity-radar');
const opacityOverlay = document.getElementById('opacity-overlay');
const togglePressure = document.getElementById('togglePressure') || document.getElementById('toggle-pressure');
const toggleClouds = document.getElementById('toggleClouds') || document.getElementById('toggle-clouds');

// Mode Buttons
const btnInspector = document.getElementById('btn-inspector');
const btnMeasure = document.getElementById('btn-measure');
const btnSounding = document.getElementById('btn-sounding');
const btnSimulateStorm = document.getElementById('btn-simulate-storm');
const dbzTooltip = document.getElementById('dbz-tooltip');

// Draw Tools
const btnDrawFree = document.getElementById('btn-draw-free');
const btnDrawLine = document.getElementById('btn-draw-line');
const btnErase = document.getElementById('btn-erase');
const btnEraseAll = document.getElementById('btn-erase-all');
const drawColorInput = document.getElementById('draw-color');
const brushSizeInput = document.getElementById('brush-size');
const eraserSizeInput = document.getElementById('eraser-size');
const brushSizeLabel = document.getElementById('brush-size-label');
const eraserSizeLabel = document.getElementById('eraser-size-label');

// Legends
const legendRainviewer = document.getElementById('legend-rainviewer');
const legendTmd = document.getElementById('legend-tmd');

// Sounding Modals
const soundingModal = document.getElementById('sounding-modal');
const btnCloseSounding = document.getElementById('btn-close-sounding');
const btnTabSkewt = document.getElementById('btn-tab-skewt');
const btnTabHodo = document.getElementById('btn-tab-hodo');
const skewtView = document.getElementById('skewt-view');
const hodoView = document.getElementById('hodo-view');

// Global State
let map = null;
let radarData = null;
let currentFrameIndex = 0;
let isPlaying = false;
let animationInterval = null;
let geolocateControl = null;
let activeMode = 'none'; // 'none', 'dbz', 'measure', 'draw_free', 'draw_line', 'erase', 'sounding'

// Measurement State
let measureGeoJSON = { type: 'FeatureCollection', features: [] };
let measurePoints = [];
let measurePopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'distance-popup' });

// Drawing State (Custom GeoJSON Engine)
let drawGeoJSON = { type: 'FeatureCollection', features: [] };
let isDrawing = false;
let currentLineCoords = [];

// Storm Engine State
let stormSimInterval = null;
let stormData = { type: 'FeatureCollection', features: [] };
let cameraLocked = false;
let stormCenter = null;

function checkToken() {
    const savedToken = localStorage.getItem('mapbox_token');
    if (savedToken) { initMap(savedToken); } else { modal.classList.add('visible'); }
}

saveTokenBtn.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    if (token) {
        localStorage.setItem('mapbox_token', token);
        modal.classList.remove('visible');
        initMap(token);
    }
});

// Init
function initMap(token) {
    // Mobile Menu Toggle
    if (btnMobileMenu) {
        btnMobileMenu.addEventListener('click', () => {
            sidebarPanel.classList.toggle('show-mobile');
        });
    }

    mapboxgl.accessToken = token;
    statusText.textContent = "Connecting to Mapbox...";

    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/navigation-night-v1',
        center: [100.9925, 15.8700],
        zoom: 5,
        minZoom: 4,
        maxBounds: [[80, -10], [120, 30]],
        pitch: 0
    });

    map.on('load', () => {
        statusText.textContent = "System Online";
        pulseDot.classList.add('active');
        pulseDot.style.animation = "none";

        // Setup 3D Terrain
        map.addSource('mapbox-dem', { 'type': 'raster-dem', 'url': 'mapbox://mapbox.mapbox-terrain-dem-v1', 'tileSize': 512, 'maxzoom': 14 });
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });

        // GPS
        geolocateControl = new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true });
        map.addControl(geolocateControl, 'bottom-right');

        // Setup OWM Weather Layers (OpenWeatherMap free layers)
        map.addSource('owm-pressure', { type: 'raster', tiles: ['https://tile.openweathermap.org/map/pressure_new/{z}/{x}/{y}.png?appid=93f3c3013d548b28cfaf9b5c23dff33a'], tileSize: 256 });
        map.addLayer({ id: 'layer-pressure', type: 'raster', source: 'owm-pressure', paint: { 'raster-opacity': 0 }, layout: { visibility: 'none' } });

        map.addSource('owm-clouds', { type: 'raster', tiles: ['https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=93f3c3013d548b28cfaf9b5c23dff33a'], tileSize: 256 });
        map.addLayer({ id: 'layer-clouds', type: 'raster', source: 'owm-clouds', paint: { 'raster-opacity': 0 }, layout: { visibility: 'none' } });

        // Setup Measure Layers
        map.addSource('measure-geojson', { type: 'geojson', data: measureGeoJSON });
        map.addLayer({ id: 'measure-lines', type: 'line', source: 'measure-geojson', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3b82f6', 'line-width': 4, 'line-dasharray': [2, 2] } });
        map.addLayer({ id: 'measure-points', type: 'circle', source: 'measure-geojson', paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-width': 2, 'circle-stroke-color': '#3b82f6' } });

        // Setup Drawing Layers (Freehand Engine)
        map.addSource('draw-geojson', { type: 'geojson', data: drawGeoJSON });
        map.addLayer({ 
            id: 'draw-lines', 
            type: 'line', 
            source: 'draw-geojson', 
            layout: { 'line-cap': 'round', 'line-join': 'round' }, 
            paint: { 
                'line-color': ['get', 'color'], 
                'line-width': ['get', 'width'] 
            } 
        });

        // Setup Storm Simulator Layer
        map.addSource('storm-source', { type: 'geojson', data: stormData });
        map.addLayer({ id: 'storm-polygons', type: 'fill', source: 'storm-source', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.6 } });
        map.addLayer({ id: 'storm-lines', type: 'line', source: 'storm-source', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-dasharray': [2, 2] } });
        map.addLayer({ id: 'storm-points', type: 'circle', source: 'storm-source', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 6, 'circle-color': '#ef4444', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });

        fetchRainViewerData();
        setupInteractionListeners();
        setupDrawingEngine();
    });
}

// --- RainViewer Radar Integration ---
async function fetchRainViewerData() {
    statusText.textContent = "Fetching Radar Data...";
    try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await response.json();
        radarData = { host: data.host, path: [...data.radar.past, ...data.radar.nowcast], version: data.version };
        setupRadarLayers();
        statusText.textContent = "Radar System Online";
    } catch (e) {
        console.error(e);
        statusText.textContent = "Radar API Offline";
    }
}

function setupRadarLayers() {
    radarData.path.forEach((frame, index) => {
        // We use scheme 6 for RV, scheme 2 for TMD simulation
        const urlRV = `${radarData.host}${frame.path}/512/{z}/{x}/{y}/6/1_1.png`;
        const urlTMD = `${radarData.host}${frame.path}/512/{z}/{x}/{y}/2/1_1.png`;
        
        map.addSource(`radar-source-${index}`, { type: 'raster', tiles: [urlRV], tileSize: 256 });
        map.addLayer({
            id: `radar-layer-${index}`,
            type: 'raster',
            source: `radar-source-${index}`,
            paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 }
        }, 'waterway-label');
    });
    slider.disabled = false;
    slider.min = 0;
    slider.max = radarData.path.length - 1;
    slider.value = radarData.path.length - 1;
    currentFrameIndex = radarData.path.length - 1;
    updateFrame(currentFrameIndex);
}

function updateFrame(index) {
    if (!radarData || !map.getLayer(`radar-layer-0`)) return;
    const opacity = opacityRadar.value / 100;
    radarData.path.forEach((_, i) => map.setPaintProperty(`radar-layer-${i}`, 'raster-opacity', 0));
    map.setPaintProperty(`radar-layer-${index}`, 'raster-opacity', opacity);
    
    const d = new Date(radarData.path[index].time * 1000);
    radarTimeEl.textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) + (index >= radarData.path.length - 3 ? " (FORECAST)" : "");
    slider.value = index;

    // Camera Lock Feature
    if (cameraLocked && stormCenter) {
        map.panTo(stormCenter, { duration: 800 });
    }
}

function playRadar() {
    if (isPlaying) {
        clearInterval(animationInterval);
        isPlaying = false;
        playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    } else {
        isPlaying = true;
        playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        animationInterval = setInterval(() => {
            currentFrameIndex = (currentFrameIndex + 1) % radarData.path.length;
            updateFrame(currentFrameIndex);
        }, 800);
    }
}

playBtn.addEventListener('click', playRadar);
slider.addEventListener('input', (e) => {
    if (isPlaying) playRadar();
    currentFrameIndex = parseInt(e.target.value);
    updateFrame(currentFrameIndex);
});
opacityRadar.addEventListener('input', () => updateFrame(currentFrameIndex));

// --- Radar Switching & Overlays ---
radarSourceSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'rainviewer') {
        currentRadarName.textContent = 'RainViewer Composite';
        legendRainviewer.classList.remove('hidden');
        legendTmd.classList.add('hidden');
        
        // Swap tile URLs to scheme 6
        radarData.path.forEach((frame, index) => {
            const url = `${radarData.host}${frame.path}/512/{z}/{x}/{y}/6/1_1.png`;
            map.getSource(`radar-source-${index}`).setTiles([url]);
        });
        map.flyTo({ center: [100.9925, 15.8700], zoom: 5, pitch: 0 });
    } else {
        currentRadarName.textContent = 'TMD Stations (Simulated)';
        legendRainviewer.classList.add('hidden');
        legendTmd.classList.remove('hidden');
        
        // Swap tile URLs to scheme 2
        radarData.path.forEach((frame, index) => {
            const url = `${radarData.host}${frame.path}/512/{z}/{x}/{y}/2/1_1.png`;
            map.getSource(`radar-source-${index}`).setTiles([url]);
        });

        // Add markers for TMD Stations
        if (!window.tmdMarkers) {
            window.tmdMarkers = [];
            const stations = [
                { id: 'bkk', center: [100.5018, 13.7563], name: 'Bangkok' },
                { id: 'cnx', center: [98.9817, 18.7883], name: 'Chiang Mai' },
                { id: 'hkt', center: [98.3923, 7.8804], name: 'Phuket' },
                { id: 'kkn', center: [102.8236, 16.4322], name: 'Khon Kaen' }
            ];
            stations.forEach(s => {
                const el = document.createElement('div');
                el.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="var(--danger)"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"></path><circle cx="12" cy="9" r="2.5" fill="white"></circle></svg>`;
                el.style.cursor = 'pointer';
                const marker = new mapboxgl.Marker(el).setLngLat(s.center).addTo(map);
                el.addEventListener('click', () => {
                    map.flyTo({ center: s.center, zoom: 8, pitch: 45 });
                    currentRadarName.textContent = `TMD Station: ${s.name}`;
                });
                window.tmdMarkers.push(marker);
            });
        }
        map.flyTo({ center: [100.5018, 13.7563], zoom: 6 });
    }
});

// Overlays Opacity
opacityOverlay.addEventListener('input', (e) => {
    const val = e.target.value / 100;
    if (map.getLayer('layer-pressure')) map.setPaintProperty('layer-pressure', 'raster-opacity', val);
    if (map.getLayer('layer-clouds')) map.setPaintProperty('layer-clouds', 'raster-opacity', val);
});

togglePressure.addEventListener('change', (e) => {
    map.setLayoutProperty('layer-pressure', 'visibility', e.target.checked ? 'visible' : 'none');
    if (e.target.checked) map.setPaintProperty('layer-pressure', 'raster-opacity', opacityOverlay.value / 100);
});

toggleClouds.addEventListener('change', (e) => {
    map.setLayoutProperty('layer-clouds', 'visibility', e.target.checked ? 'visible' : 'none');
    if (e.target.checked) map.setPaintProperty('layer-clouds', 'raster-opacity', opacityOverlay.value / 100);
});


// --- UI Interaction & Modes ---
function setMode(mode) {
    activeMode = mode;
    [btnInspector, btnMeasure, btnDrawFree, btnDrawLine, btnErase, btnSounding].forEach(b => b.classList.remove('active'));
    map.getCanvas().classList.remove('cursor-eraser');
    
    // Default Drag Pan
    map.dragPan.enable();

    if (mode === 'dbz') { btnInspector.classList.add('active'); map.getCanvas().style.cursor = 'crosshair'; }
    else if (mode === 'measure') { btnMeasure.classList.add('active'); map.getCanvas().style.cursor = 'crosshair'; }
    else if (mode === 'sounding') { btnSounding.classList.add('active'); map.getCanvas().style.cursor = 'help'; }
    else if (mode === 'draw_free') { 
        btnDrawFree.classList.add('active'); 
        map.getCanvas().style.cursor = 'crosshair'; 
        map.dragPan.disable(); // Disable pan to allow drawing
    }
    else if (mode === 'draw_line') { 
        btnDrawLine.classList.add('active'); 
        map.getCanvas().style.cursor = 'crosshair';
        map.dragPan.disable();
    }
    else if (mode === 'erase') {
        btnErase.classList.add('active');
        map.getCanvas().style.cursor = '';
        map.getCanvas().classList.add('cursor-eraser');
        map.dragPan.disable();
    }
    else { map.getCanvas().style.cursor = ''; }

    // Cleanup Measure if not active
    if (mode !== 'measure') {
        measurePoints = [];
        measureGeoJSON.features = [];
        if (map.getSource('measure-geojson')) map.getSource('measure-geojson').setData(measureGeoJSON);
        measurePopup.remove();
    }
}

btnInspector.addEventListener('click', () => setMode(activeMode === 'dbz' ? 'none' : 'dbz'));
btnMeasure.addEventListener('click', () => setMode(activeMode === 'measure' ? 'none' : 'measure'));
btnSounding.addEventListener('click', () => setMode(activeMode === 'sounding' ? 'none' : 'sounding'));

// --- Drawing Engine (Freehand & Lines) ---
btnDrawFree.addEventListener('click', () => setMode('draw_free'));
btnDrawLine.addEventListener('click', () => setMode('draw_line'));
btnErase.addEventListener('click', () => setMode('erase'));

brushSizeInput.addEventListener('input', e => brushSizeLabel.textContent = `Brush: ${e.target.value}px`);
eraserSizeInput.addEventListener('input', e => eraserSizeLabel.textContent = `${e.target.value}px`);

btnEraseAll.addEventListener('click', () => {
    drawGeoJSON.features = [];
    map.getSource('draw-geojson').setData(drawGeoJSON);
});

function setupDrawingEngine() {
    map.on('mousedown', (e) => {
        if (activeMode === 'draw_free' || activeMode === 'draw_line') {
            isDrawing = true;
            currentLineCoords = [[e.lngLat.lng, e.lngLat.lat]];
        }
    });

    map.on('mousemove', (e) => {
        // Erase Logic
        if (activeMode === 'erase' && e.originalEvent.buttons === 1) {
            const mousePoint = turf.point([e.lngLat.lng, e.lngLat.lat]);
            const eraserRadius = parseInt(eraserSizeInput.value) / 10; // Convert to approx KM
            
            // Filter out drawn features that intersect with the eraser buffer
            drawGeoJSON.features = drawGeoJSON.features.filter(feature => {
                // If it's a line, calculate distance from points to mouse
                const linePoints = feature.geometry.coordinates;
                let isHit = false;
                for (let pt of linePoints) {
                    if (turf.distance(mousePoint, turf.point(pt), {units: 'kilometers'}) < eraserRadius) {
                        isHit = true; break;
                    }
                }
                return !isHit;
            });
            map.getSource('draw-geojson').setData(drawGeoJSON);
        }

        // Draw Logic
        if (isDrawing && activeMode === 'draw_free') {
            currentLineCoords.push([e.lngLat.lng, e.lngLat.lat]);
            
            // Create temporary feature array including the current line
            const tempFeature = {
                type: 'Feature',
                properties: { color: drawColorInput.value, width: parseInt(brushSizeInput.value) },
                geometry: { type: 'LineString', coordinates: currentLineCoords }
            };
            
            map.getSource('draw-geojson').setData({
                type: 'FeatureCollection',
                features: [...drawGeoJSON.features, tempFeature]
            });
        }
    });

    map.on('mouseup', (e) => {
        if (isDrawing) {
            isDrawing = false;
            if (activeMode === 'draw_line') {
                currentLineCoords.push([e.lngLat.lng, e.lngLat.lat]); // End point
            }
            
            if (currentLineCoords.length > 1) {
                drawGeoJSON.features.push({
                    type: 'Feature',
                    properties: { color: drawColorInput.value, width: parseInt(brushSizeInput.value) },
                    geometry: { type: 'LineString', coordinates: currentLineCoords }
                });
                map.getSource('draw-geojson').setData(drawGeoJSON);
            }
            currentLineCoords = [];
        }
    });
}

// --- General Interactions (Click / Hover) ---
function setupInteractionListeners() {
    map.on('mousemove', (e) => {
        if (activeMode === 'dbz') {
            const dist = turf.distance([e.lngLat.lng, e.lngLat.lat], [100.99, 15.87]);
            const mockDbz = Math.max(0, 75 - (dist * 2) + (Math.random() * 5));
            dbzTooltip.classList.remove('hidden');
            dbzTooltip.style.left = e.point.x + 15 + 'px';
            dbzTooltip.style.top = e.point.y + 15 + 'px';
            dbzTooltip.querySelector('.dbz-val').textContent = mockDbz > 10 ? mockDbz.toFixed(1) : '--';
        } else {
            dbzTooltip.classList.add('hidden');
        }
    });

    map.on('click', (e) => {
        if (activeMode === 'measure') {
            const coords = [e.lngLat.lng, e.lngLat.lat];
            measurePoints.push(coords);
            measureGeoJSON.features = [];
            
            measurePoints.forEach(pt => measureGeoJSON.features.push(turf.point(pt)));

            if (measurePoints.length > 1) {
                const line = turf.lineString(measurePoints);
                measureGeoJSON.features.push(line);
                const distance = turf.length(line, {units: 'kilometers'});
                measurePopup.setLngLat(coords).setHTML(`Distance: ${distance.toFixed(2)} km`).addTo(map);
            }
            map.getSource('measure-geojson').setData(measureGeoJSON);
        }

        if (activeMode === 'sounding') {
            // Open SHARPpy Mock Modal
            soundingModal.classList.add('visible');
            setMode('none');
        }
    });

    // Camera Lock on Storm Trajectory
    map.on('click', 'storm-points', (e) => {
        if (cameraLocked) {
            cameraLocked = false;
            map.getCanvas().style.cursor = '';
            alert("Camera Lock Disabled.");
        } else {
            cameraLocked = true;
            map.getCanvas().style.cursor = 'crosshair';
            alert("Camera Locked to Storm Core.");
        }
    });
    map.on('mouseenter', 'storm-points', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'storm-points', () => { if(!cameraLocked) map.getCanvas().style.cursor = ''; });
}

// --- Sounding Modal UI ---
btnCloseSounding.addEventListener('click', () => soundingModal.classList.remove('visible'));
btnTabSkewt.addEventListener('click', () => { btnTabSkewt.classList.add('active'); btnTabHodo.classList.remove('active'); skewtView.classList.add('active'); hodoView.classList.remove('active'); });
btnTabHodo.addEventListener('click', () => { btnTabHodo.classList.add('active'); btnTabSkewt.classList.remove('active'); hodoView.classList.add('active'); skewtView.classList.remove('active'); });

// --- Storm Engine Simulator (Concentric Polygons) ---
btnSimulateStorm.addEventListener('click', () => {
    if (stormSimInterval) {
        clearInterval(stormSimInterval);
        stormSimInterval = null;
        cameraLocked = false;
        stormData.features = [];
        map.getSource('storm-source').setData(stormData);
        btnSimulateStorm.classList.remove('active');
        return;
    }
    
    btnSimulateStorm.classList.add('active');
    
    // Spawn near Bangkok
    stormCenter = [100.5, 13.8];
    const bearing = 45; // NE
    const speed = 0.08; 
    
    stormSimInterval = setInterval(() => {
        // Move center
        const moved = turf.destination(turf.point(stormCenter), speed, bearing, {units: 'kilometers'});
        stormCenter = moved.geometry.coordinates;
        
        // Concentric Polygons: Green (Light), Yellow (Mod), Red (Heavy), Purple (Core)
        const cellGreen = turf.ellipse(stormCenter, 60, 30, {angle: bearing + 90, units: 'kilometers'});
        cellGreen.properties = { color: '#22c55e' };
        
        const cellYellow = turf.ellipse(stormCenter, 45, 20, {angle: bearing + 90, units: 'kilometers'});
        cellYellow.properties = { color: '#eab308' };

        const cellRed = turf.ellipse(stormCenter, 30, 10, {angle: bearing + 90, units: 'kilometers'});
        cellRed.properties = { color: '#ef4444' };

        const cellPurple = turf.ellipse(stormCenter, 15, 5, {angle: bearing + 90, units: 'kilometers'});
        cellPurple.properties = { color: '#a855f7' };
        
        // Generate Trajectory Track
        const trackStart = stormCenter;
        const trackEnd = turf.destination(turf.point(stormCenter), 150, bearing, {units: 'kilometers'}).geometry.coordinates;
        const track = turf.lineString([trackStart, trackEnd]);
        
        // Track Clickable Point (Dot)
        const trackDot = turf.point(trackStart);

        stormData.features = [cellGreen, cellYellow, cellRed, cellPurple, track, trackDot];
        map.getSource('storm-source').setData(stormData);
    }, 1000);
});

// GPS
gpsBtn.addEventListener('click', () => {
    if (geolocateControl) {
        geolocateControl.trigger();
        gpsBtn.classList.add('active');
        setTimeout(() => gpsBtn.classList.remove('active'), 2000);
    }
});

// Startup
checkToken();
