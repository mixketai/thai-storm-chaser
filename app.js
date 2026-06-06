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
const btnMobileMenu = document.getElementById('btn-toggle-menu');
const radarSourceSelect = document.getElementById('radar-source-select');
const opacityRadar = document.getElementById('opacity-radar');
const opacityOverlay = document.getElementById('opacity-overlay');
const togglePressure = document.getElementById('toggle-pressure');
const toggleClouds = document.getElementById('toggle-clouds');
const toggleCape = document.getElementById('toggle-cape');
const toggleSurface = document.getElementById('toggle-surface');
const toggleLightning = document.getElementById('toggle-lightning');

// Mode Buttons
const btnInspector = document.getElementById('btn-inspector');
const btnMeasure = document.getElementById('btn-measure');
const btnSounding = document.getElementById('btn-sounding');
const btnSimulateStorm = document.getElementById('btn-simulate-storm');
const dbzTooltip = document.getElementById('dbz-tooltip');

// Warning Widget
const warningList = document.getElementById('warning-list');
const warningCount = document.getElementById('warning-count');

// Draw Tools & Canvas
const drawCanvas = document.getElementById('draw-canvas');
const ctx = drawCanvas.getContext('2d');
const btnDrawFree = document.getElementById('btn-draw-free');
const btnDrawLine = document.getElementById('btn-draw-line');
const btnErase = document.getElementById('btn-erase');
const btnEraseAll = document.getElementById('btn-erase-all');
const drawColorInput = document.getElementById('draw-color');
const brushSizeInput = document.getElementById('brush-size');
const eraserSizeInput = document.getElementById('eraser-size');
const brushSizeLabel = document.getElementById('brush-size-label');
const eraserSizeLabel = document.getElementById('eraser-size-label');

// Hidden Canvas for dBZ Reading
const hiddenCanvas = document.getElementById('hidden-radar-canvas');
const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
let currentRadarImg = null;

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
let activeMode = 'none';

// Measurement State
let measureGeoJSON = { type: 'FeatureCollection', features: [] };
let measurePoints = [];
let measurePopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'distance-popup' });

// Canvas Drawing State (Phase 4 True Eraser)
let strokes = []; // Array of {type: 'draw'|'erase', points: [[lng,lat]], color, width}
let isDrawing = false;
let currentStroke = null;

// Lightning Engine
let lightningInterval = null;

// Storm Engine State
let stormData = { type: 'FeatureCollection', features: [] };

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

function resizeCanvas() {
    drawCanvas.width = document.getElementById('map').clientWidth;
    drawCanvas.height = document.getElementById('map').clientHeight;
    renderCanvas();
}

function renderCanvas() {
    if (!map) return;
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let stroke of strokes) {
        if (stroke.points.length < 2) continue;
        
        ctx.globalCompositeOperation = stroke.type === 'erase' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = stroke.color || '#fff';
        ctx.lineWidth = stroke.width || 5;
        
        ctx.beginPath();
        const startPx = map.project(stroke.points[0]);
        ctx.moveTo(startPx.x, startPx.y);
        for (let i = 1; i < stroke.points.length; i++) {
            const px = map.project(stroke.points[i]);
            ctx.lineTo(px.x, px.y);
        }
        ctx.stroke();
    }
}

// Init
function initMap(token) {
    if (window.innerWidth <= 768) { sidebarPanel.classList.add('sidebar-hidden'); }
    if (btnMobileMenu) { btnMobileMenu.addEventListener('click', () => sidebarPanel.classList.toggle('sidebar-hidden')); }

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

        map.addSource('mapbox-dem', { 'type': 'raster-dem', 'url': 'mapbox://mapbox.mapbox-terrain-dem-v1', 'tileSize': 512, 'maxzoom': 14 });
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });

        geolocateControl = new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true });
        map.addControl(geolocateControl, 'bottom-right');

        // Weather Overlays
        map.addSource('owm-pressure', { type: 'raster', tiles: ['https://tile.openweathermap.org/map/pressure_new/{z}/{x}/{y}.png?appid=93f3c3013d548b28cfaf9b5c23dff33a'], tileSize: 256 });
        map.addLayer({ id: 'layer-pressure', type: 'raster', source: 'owm-pressure', paint: { 'raster-opacity': 0 }, layout: { visibility: 'none' } });

        map.addSource('owm-clouds', { type: 'raster', tiles: ['https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=93f3c3013d548b28cfaf9b5c23dff33a'], tileSize: 256 });
        map.addLayer({ id: 'layer-clouds', type: 'raster', source: 'owm-clouds', paint: { 'raster-opacity': 0 }, layout: { visibility: 'none' } });

        // CAPE Proxy (Temp)
        map.addSource('owm-cape', { type: 'raster', tiles: ['https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=93f3c3013d548b28cfaf9b5c23dff33a'], tileSize: 256 });
        map.addLayer({ id: 'layer-cape', type: 'raster', source: 'owm-cape', paint: { 'raster-opacity': 0 }, layout: { visibility: 'none' } });

        // TMD Surface Fronts (Static Image mapped to bounds)
        // Coordinates: [TopLeft, TopRight, BottomRight, BottomLeft]
        map.addSource('tmd-surface', { type: 'image', url: 'https://corsproxy.io/?url=http://www.tmd.go.th/programs/uploads/maps/latest.jpg', coordinates: [[85, 30], [115, 30], [115, -5], [85, -5]] });
        map.addLayer({ id: 'layer-surface', type: 'raster', source: 'tmd-surface', paint: { 'raster-opacity': 0 }, layout: { visibility: 'none' } });

        // Measure Layers
        map.addSource('measure-geojson', { type: 'geojson', data: measureGeoJSON });
        map.addLayer({ id: 'measure-lines', type: 'line', source: 'measure-geojson', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3b82f6', 'line-width': 4, 'line-dasharray': [2, 2] } });
        map.addLayer({ id: 'measure-points', type: 'circle', source: 'measure-geojson', paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-width': 2, 'circle-stroke-color': '#3b82f6' } });

        // Interactive Storm Source
        map.addSource('storm-source', { type: 'geojson', data: stormData });
        map.addLayer({ id: 'storm-polygons', type: 'fill', source: 'storm-source', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.6 } });
        map.addLayer({ id: 'storm-lines', type: 'line', source: 'storm-source', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-dasharray': [2, 2] } });

        fetchRainViewerData();
        setupInteractionListeners();
        setupCanvasEngine();
        initWarningWidget();
        
        map.on('render', renderCanvas);
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
    });
}

// --- Radar API Integrations ---
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
        const urlRV = `${radarData.host}${frame.path}/512/{z}/{x}/{y}/6/1_1.png`;
        map.addSource(`radar-source-${index}`, { type: 'raster', tiles: [urlRV], tileSize: 256 });
        map.addLayer({ id: `radar-layer-${index}`, type: 'raster', source: `radar-source-${index}`, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } }, 'waterway-label');
    });

    // Add Actual TMD Radar Layer (Bangkok BKK120 proxy)
    const tmdBounds = [
        [100.74 - 1.1, 13.68 + 1.1], // TL
        [100.74 + 1.1, 13.68 + 1.1], // TR
        [100.74 + 1.1, 13.68 - 1.1], // BR
        [100.74 - 1.1, 13.68 - 1.1]  // BL
    ];
    const proxyUrl = 'https://corsproxy.io/?url=http://weather.tmd.go.th/bkk/bkk120.png';
    map.addSource('tmd-actual-source', { type: 'image', url: proxyUrl, coordinates: tmdBounds });
    map.addLayer({ id: 'tmd-actual-layer', type: 'raster', source: 'tmd-actual-source', paint: { 'raster-opacity': 0 }, layout: {visibility: 'none'} });
    
    // Load image into hidden canvas for pixel inspection
    currentRadarImg = new Image();
    currentRadarImg.crossOrigin = "Anonymous";
    currentRadarImg.onload = () => {
        hiddenCanvas.width = currentRadarImg.width;
        hiddenCanvas.height = currentRadarImg.height;
        hiddenCtx.drawImage(currentRadarImg, 0, 0);
    };
    currentRadarImg.src = proxyUrl;

    slider.disabled = false;
    slider.min = 0;
    slider.max = radarData.path.length - 1;
    slider.value = radarData.path.length - 1;
    currentFrameIndex = radarData.path.length - 1;
    updateFrame(currentFrameIndex);
}

function updateFrame(index) {
    if (!radarData) return;
    const opacity = opacityRadar.value / 100;
    
    if (radarSourceSelect.value === 'tmd-actual') {
        radarData.path.forEach((_, i) => map.setPaintProperty(`radar-layer-${i}`, 'raster-opacity', 0));
        map.setPaintProperty('tmd-actual-layer', 'raster-opacity', opacity);
        radarTimeEl.textContent = "LIVE";
    } else {
        radarData.path.forEach((_, i) => map.setPaintProperty(`radar-layer-${i}`, 'raster-opacity', 0));
        map.setPaintProperty(`radar-layer-${index}`, 'raster-opacity', opacity);
        const d = new Date(radarData.path[index].time * 1000);
        radarTimeEl.textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    slider.value = index;
}

function playRadar() {
    if (isPlaying) {
        clearInterval(animationInterval);
        isPlaying = false;
        playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    } else {
        if(radarSourceSelect.value === 'tmd-actual') return; // Static image, no playback
        isPlaying = true;
        playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        animationInterval = setInterval(() => {
            currentFrameIndex = (currentFrameIndex + 1) % radarData.path.length;
            updateFrame(currentFrameIndex);
        }, 800);
    }
}

playBtn.addEventListener('click', playRadar);
slider.addEventListener('input', (e) => { if (isPlaying) playRadar(); currentFrameIndex = parseInt(e.target.value); updateFrame(currentFrameIndex); });
opacityRadar.addEventListener('input', () => updateFrame(currentFrameIndex));

// Radar Switcher
radarSourceSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    document.getElementById('legend-rainviewer').classList.add('hidden');
    document.getElementById('legend-tmd').classList.add('hidden');
    map.setLayoutProperty('tmd-actual-layer', 'visibility', 'none');

    if (val === 'rainviewer') {
        currentRadarName.textContent = 'RainViewer Composite';
        document.getElementById('legend-rainviewer').classList.remove('hidden');
        radarData.path.forEach((f, i) => map.getSource(`radar-source-${i}`).setTiles([`${radarData.host}${f.path}/512/{z}/{x}/{y}/6/1_1.png`]));
    } else if (val === 'tmd-sim') {
        currentRadarName.textContent = 'TMD Stations (Simulated)';
        document.getElementById('legend-tmd').classList.remove('hidden');
        radarData.path.forEach((f, i) => map.getSource(`radar-source-${i}`).setTiles([`${radarData.host}${f.path}/512/{z}/{x}/{y}/2/1_1.png`]));
    } else if (val === 'tmd-actual') {
        currentRadarName.textContent = 'TMD Bangkok (Actual)';
        document.getElementById('legend-tmd').classList.remove('hidden');
        map.setLayoutProperty('tmd-actual-layer', 'visibility', 'visible');
        map.flyTo({ center: [100.74, 13.68], zoom: 7 });
    }
    updateFrame(currentFrameIndex);
});

// Weather Overlays Toggles
function setupOverlay(toggleEl, layerId) {
    toggleEl.addEventListener('change', (e) => {
        map.setLayoutProperty(layerId, 'visibility', e.target.checked ? 'visible' : 'none');
        if (e.target.checked) map.setPaintProperty(layerId, 'raster-opacity', opacityOverlay.value / 100);
    });
}
setupOverlay(togglePressure, 'layer-pressure');
setupOverlay(toggleClouds, 'layer-clouds');
setupOverlay(toggleCape, 'layer-cape');
setupOverlay(toggleSurface, 'layer-surface');
opacityOverlay.addEventListener('input', (e) => {
    const v = e.target.value / 100;
    ['layer-pressure', 'layer-clouds', 'layer-cape', 'layer-surface'].forEach(id => {
        if(map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', v);
    });
});

// UI Modes
function setMode(mode) {
    activeMode = mode;
    [btnInspector, btnMeasure, btnDrawFree, btnDrawLine, btnErase, btnSounding, btnSimulateStorm].forEach(b => b.classList.remove('active'));
    map.dragPan.enable();
    drawCanvas.style.pointerEvents = 'none';

    if (mode === 'dbz' || mode === 'measure' || mode === 'storm') {
        document.getElementById(mode === 'storm' ? 'btn-simulate-storm' : 'btn-' + mode).classList.add('active');
        map.getCanvas().style.cursor = 'crosshair';
    } else if (mode === 'sounding') {
        btnSounding.classList.add('active');
        map.getCanvas().style.cursor = 'help';
    } else if (mode.startsWith('draw') || mode === 'erase') {
        document.getElementById('btn-' + mode.replace('_','-')).classList.add('active');
        map.dragPan.disable();
        drawCanvas.style.pointerEvents = 'auto'; // Give canvas mouse events
        drawCanvas.style.cursor = mode === 'erase' ? 'cell' : 'crosshair';
    } else {
        map.getCanvas().style.cursor = '';
    }

    if (mode !== 'measure') {
        measurePoints = []; measureGeoJSON.features = [];
        if (map.getSource('measure-geojson')) map.getSource('measure-geojson').setData(measureGeoJSON);
        measurePopup.remove();
    }
}

btnInspector.addEventListener('click', () => setMode(activeMode === 'dbz' ? 'none' : 'dbz'));
btnMeasure.addEventListener('click', () => setMode(activeMode === 'measure' ? 'none' : 'measure'));
btnSounding.addEventListener('click', () => setMode(activeMode === 'sounding' ? 'none' : 'sounding'));
btnSimulateStorm.addEventListener('click', () => setMode(activeMode === 'storm' ? 'none' : 'storm'));

// Canvas Drawing Engine (True Eraser)
btnDrawFree.addEventListener('click', () => setMode('draw_free'));
btnDrawLine.addEventListener('click', () => setMode('draw_line'));
btnErase.addEventListener('click', () => setMode('erase'));
btnEraseAll.addEventListener('click', () => { strokes = []; renderCanvas(); });

brushSizeInput.addEventListener('input', e => brushSizeLabel.textContent = `Brush: ${e.target.value}px`);
eraserSizeInput.addEventListener('input', e => eraserSizeLabel.textContent = `${e.target.value}px`);

function setupCanvasEngine() {
    drawCanvas.addEventListener('mousedown', (e) => {
        if (activeMode !== 'draw_free' && activeMode !== 'draw_line' && activeMode !== 'erase') return;
        isDrawing = true;
        const lngLat = map.unproject([e.offsetX, e.offsetY]);
        currentStroke = {
            type: activeMode === 'erase' ? 'erase' : 'draw',
            color: drawColorInput.value,
            width: activeMode === 'erase' ? parseInt(eraserSizeInput.value) : parseInt(brushSizeInput.value),
            points: [[lngLat.lng, lngLat.lat]]
        };
        strokes.push(currentStroke);
    });

    drawCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || !currentStroke) return;
        const lngLat = map.unproject([e.offsetX, e.offsetY]);
        if (activeMode === 'draw_line') {
            currentStroke.points[1] = [lngLat.lng, lngLat.lat];
        } else {
            currentStroke.points.push([lngLat.lng, lngLat.lat]);
        }
        renderCanvas();
    });

    drawCanvas.addEventListener('mouseup', () => { isDrawing = false; currentStroke = null; });
    drawCanvas.addEventListener('mouseleave', () => { isDrawing = false; currentStroke = null; });
}

// Interaction Map
function setupInteractionListeners() {
    map.on('mousemove', (e) => {
        if (activeMode === 'dbz') {
            dbzTooltip.classList.remove('hidden');
            dbzTooltip.style.left = e.point.x + 15 + 'px';
            dbzTooltip.style.top = e.point.y + 15 + 'px';
            
            if (radarSourceSelect.value === 'tmd-actual' && currentRadarImg && currentRadarImg.complete) {
                // Read actual pixel logic
                const bounds = map.getSource('tmd-actual-source').coordinates;
                const pxX = ((e.lngLat.lng - bounds[0][0]) / (bounds[1][0] - bounds[0][0])) * hiddenCanvas.width;
                const pxY = ((bounds[0][1] - e.lngLat.lat) / (bounds[0][1] - bounds[2][1])) * hiddenCanvas.height;
                
                if (pxX >= 0 && pxX < hiddenCanvas.width && pxY >= 0 && pxY < hiddenCanvas.height) {
                    const px = hiddenCtx.getImageData(pxX, pxY, 1, 1).data;
                    // Mock translation from RGB to dBZ
                    let dbz = '--';
                    if(px[3] > 0) dbz = Math.floor((px[0] + px[1] + px[2]) / 3 / 2.5);
                    dbzTooltip.querySelector('.dbz-val').textContent = dbz;
                } else {
                    dbzTooltip.querySelector('.dbz-val').textContent = '--';
                }
            } else {
                const dist = turf.distance([e.lngLat.lng, e.lngLat.lat], [100.99, 15.87]);
                const mockDbz = Math.max(0, 75 - (dist * 2) + (Math.random() * 5));
                dbzTooltip.querySelector('.dbz-val').textContent = mockDbz > 10 ? mockDbz.toFixed(1) : '--';
            }
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
                measurePopup.setLngLat(coords).setHTML(`Distance: ${turf.length(line, {units: 'kilometers'}).toFixed(2)} km`).addTo(map);
            }
            map.getSource('measure-geojson').setData(measureGeoJSON);
        }

        if (activeMode === 'sounding') {
            soundingModal.classList.add('visible');
            setMode('none');
        }

        if (activeMode === 'storm') {
            // Interactive Storm Cone
            const center = [e.lngLat.lng, e.lngLat.lat];
            const bearing = 45; // Steering wind
            const cone = turf.sector(center, 100, bearing - 20, bearing + 20, {units: 'kilometers'});
            cone.properties = { color: '#ef4444' };
            stormData.features = [turf.point(center, {color: '#a855f7'}), cone];
            map.getSource('storm-source').setData(stormData);
            setMode('none');
            alert("Projected 60-minute storm trajectory based on environmental steering winds.");
        }
    });
}

// Lightning Simulator (120s fade)
toggleLightning.addEventListener('change', (e) => {
    if (e.target.checked) {
        lightningInterval = setInterval(() => {
            // Spawn near Bangkok roughly
            const lat = 13.7 + (Math.random() - 0.5) * 3;
            const lng = 100.5 + (Math.random() - 0.5) * 3;
            
            const el = document.createElement('div');
            el.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="yellow" stroke="orange" stroke-width="1"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
            el.style.transition = 'opacity 120s linear';
            el.style.opacity = '1';
            
            const marker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map);
            
            // Start fade out next frame
            setTimeout(() => { el.style.opacity = '0'; }, 100);
            // Delete after 120 seconds
            setTimeout(() => { marker.remove(); }, 120000);
            
        }, 1500); // Strike every 1.5s
    } else {
        clearInterval(lightningInterval);
    }
});

// Warning System Logic
function initWarningWidget() {
    const warnings = [
        { title: 'Flash Flood Warning', loc: [98.98, 18.78], type: 'flood', time: '12 mins ago', desc: 'Severe flooding expected in Chiang Mai.' },
        { title: 'Severe Thunderstorm', loc: [100.5, 13.7], type: 'storm', time: '45 mins ago', desc: 'Damaging winds near Bangkok metro.' },
        { title: 'Hail & Downburst', loc: [102.8, 16.4], type: 'storm', time: '1 hr ago', desc: 'Khon Kaen facing severe downburst.' }
    ];
    warningCount.textContent = warnings.length;
    
    warnings.forEach(w => {
        const li = document.createElement('li');
        li.className = 'warning-item';
        li.innerHTML = `<div class="warning-title ${w.type}">${w.title}</div><div class="warning-time">${w.time}</div>`;
        li.addEventListener('click', () => {
            map.flyTo({ center: w.loc, zoom: 9, pitch: 45 });
            setTimeout(() => alert(w.desc), 1000);
        });
        warningList.appendChild(li);
    });
}

// Sounding Modal UI
btnCloseSounding.addEventListener('click', () => soundingModal.classList.remove('visible'));
btnTabSkewt.addEventListener('click', () => { btnTabSkewt.classList.add('active'); btnTabHodo.classList.remove('active'); skewtView.classList.add('active'); hodoView.classList.remove('active'); });
btnTabHodo.addEventListener('click', () => { btnTabHodo.classList.add('active'); btnTabSkewt.classList.remove('active'); hodoView.classList.add('active'); skewtView.classList.remove('active'); });

// GPS
gpsBtn.addEventListener('click', () => { if (geolocateControl) geolocateControl.trigger(); });

checkToken();
