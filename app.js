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
const sidebarPanel = document.getElementById('sidebar');
const sidebarResizer = document.getElementById('sidebar-resizer');
const btnSidebarUndo = document.getElementById('btn-sidebar-undo');
const btnSidebarRedo = document.getElementById('btn-sidebar-redo');
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
const btnShowWarnings = document.getElementById('btn-show-warnings');
const warningWidget = document.getElementById('warning-widget');
const btnCloseWarnings = document.getElementById('btn-close-warnings');
const warningList = document.getElementById('warning-list');
const warningBadge = document.getElementById('warning-badge');

// Draw Tools & Canvas
const drawCanvas = document.getElementById('draw-canvas');
const ctx = drawCanvas.getContext('2d');
const btnDrawFree = document.getElementById('btn-draw-free');
const btnDrawLine = document.getElementById('btn-draw-line');
const btnErase = document.getElementById('btn-erase');
const btnEraseAll = document.getElementById('btn-erase-all');
const btnDrawUndo = document.getElementById('btn-draw-undo');
const btnDrawRedo = document.getElementById('btn-draw-redo');
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

// Sidebar Resizer State
let sidebarWidthHistory = [280];
let sidebarHistoryIndex = 0;
let isResizing = false;

// Drawing Undo/Redo State
let strokes = []; 
let drawUndoStack = [];
let isDrawing = false;
let currentStroke = null;

// Lightning & Warnings
let lightningInterval = null;
let activeWarnings = [];
let warningSimInterval = null;

// Storm Engine State
let stormData = { type: 'FeatureCollection', features: [] };
let stormTrajectoryCoords = [];

// TMD Actual Stations Database
const tmdStations = [
    { id: 'bkk', name: 'Bangkok (BKK)', center: [100.74, 13.68], bounds: [[100.74 - 1.1, 13.68 + 1.1], [100.74 + 1.1, 13.68 + 1.1], [100.74 + 1.1, 13.68 - 1.1], [100.74 - 1.1, 13.68 - 1.1]], url: 'bkk/bkk120.png' },
    { id: 'phs', name: 'Phitsanulok (PHS)', center: [100.26, 16.82], bounds: [[100.26 - 1.1, 16.82 + 1.1], [100.26 + 1.1, 16.82 + 1.1], [100.26 + 1.1, 16.82 - 1.1], [100.26 - 1.1, 16.82 - 1.1]], url: 'phs/phs120.png' },
    { id: 'srt', name: 'Surat Thani (SRT)', center: [99.14, 9.13], bounds: [[99.14 - 1.1, 9.13 + 1.1], [99.14 + 1.1, 9.13 + 1.1], [99.14 + 1.1, 9.13 - 1.1], [99.14 - 1.1, 9.13 - 1.1]], url: 'srt/srt120.png' }
];
let tmdMarkers = [];
let activeTmdStation = null;


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

// Canvas Setup
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

// Sidebar Resizer Logic
sidebarResizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    sidebarResizer.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
});
window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.max(200, Math.min(800, e.clientX - 20)); // min 200, max 800
    sidebarPanel.style.width = newWidth + 'px';
});
window.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        sidebarResizer.classList.remove('resizing');
        document.body.style.cursor = '';
        const w = parseInt(sidebarPanel.style.width);
        if (w !== sidebarWidthHistory[sidebarHistoryIndex]) {
            sidebarWidthHistory = sidebarWidthHistory.slice(0, sidebarHistoryIndex + 1);
            sidebarWidthHistory.push(w);
            sidebarHistoryIndex++;
        }
    }
});
btnSidebarUndo.addEventListener('click', () => {
    if (sidebarHistoryIndex > 0) {
        sidebarHistoryIndex--;
        sidebarPanel.style.width = sidebarWidthHistory[sidebarHistoryIndex] + 'px';
    }
});
btnSidebarRedo.addEventListener('click', () => {
    if (sidebarHistoryIndex < sidebarWidthHistory.length - 1) {
        sidebarHistoryIndex++;
        sidebarPanel.style.width = sidebarWidthHistory[sidebarHistoryIndex] + 'px';
    }
});

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
        pitch: 0,
        doubleClickZoom: false // Disable to allow storm tracker double click
    });

    map.on('load', () => {
        statusText.textContent = "System Online";
        pulseDot.classList.add('active');
        pulseDot.style.animation = "none";

        map.addSource('mapbox-dem', { 'type': 'raster-dem', 'url': 'mapbox://mapbox.mapbox-terrain-dem-v1', 'tileSize': 512, 'maxzoom': 14 });
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });

        geolocateControl = new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true });
        map.addControl(geolocateControl, 'bottom-right');

        // Layers
        map.addSource('owm-pressure', { type: 'raster', tiles: ['https://tile.openweathermap.org/map/pressure_new/{z}/{x}/{y}.png?appid=93f3c3013d548b28cfaf9b5c23dff33a'], tileSize: 256 });
        map.addLayer({ id: 'layer-pressure', type: 'raster', source: 'owm-pressure', paint: { 'raster-opacity': 0 }, layout: { visibility: 'none' } });

        map.addSource('owm-clouds', { type: 'raster', tiles: ['https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=93f3c3013d548b28cfaf9b5c23dff33a'], tileSize: 256 });
        map.addLayer({ id: 'layer-clouds', type: 'raster', source: 'owm-clouds', paint: { 'raster-opacity': 0 }, layout: { visibility: 'none' } });

        map.addSource('owm-cape', { type: 'raster', tiles: ['https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=93f3c3013d548b28cfaf9b5c23dff33a'], tileSize: 256 });
        map.addLayer({ id: 'layer-cape', type: 'raster', source: 'owm-cape', paint: { 'raster-opacity': 0 }, layout: { visibility: 'none' } });

        map.addSource('tmd-surface', { type: 'image', url: 'https://corsproxy.io/?url=http://www.tmd.go.th/programs/uploads/maps/latest.jpg', coordinates: [[85, 30], [115, 30], [115, -5], [85, -5]] });
        map.addLayer({ id: 'layer-surface', type: 'raster', source: 'tmd-surface', paint: { 'raster-opacity': 0 }, layout: { visibility: 'none' } });

        map.addSource('storm-source', { type: 'geojson', data: stormData });
        map.addLayer({ id: 'storm-lines', type: 'line', source: 'storm-source', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#eab308', 'line-width': 4, 'line-dasharray': [2, 2] } });
        map.addLayer({ id: 'storm-points', type: 'circle', source: 'storm-source', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 6, 'circle-color': '#ef4444', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });

        fetchRainViewerData();
        setupInteractionListeners();
        setupCanvasEngine();
        initWarningSystem();
        
        map.on('render', renderCanvas);
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
    });
}

// Radar APIs
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
    }
}

function setupRadarLayers() {
    radarData.path.forEach((frame, index) => {
        const urlRV = `${radarData.host}${frame.path}/512/{z}/{x}/{y}/6/1_1.png`;
        map.addSource(`radar-source-${index}`, { type: 'raster', tiles: [urlRV], tileSize: 256 });
        map.addLayer({ id: `radar-layer-${index}`, type: 'raster', source: `radar-source-${index}`, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } }, 'waterway-label');
    });

    // TMD Actual Dynamic Layer
    map.addSource('tmd-actual-source', { type: 'image', url: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', coordinates: tmdStations[0].bounds });
    map.addLayer({ id: 'tmd-actual-layer', type: 'raster', source: 'tmd-actual-source', paint: { 'raster-opacity': 0 }, layout: {visibility: 'none'} }, 'waterway-label');

    slider.disabled = false;
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
        if(radarSourceSelect.value === 'tmd-actual') return; 
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
    tmdMarkers.forEach(m => m.remove());
    tmdMarkers = [];

    if (val === 'rainviewer') {
        currentRadarName.textContent = 'RainViewer Composite';
        document.getElementById('legend-rainviewer').classList.remove('hidden');
        radarData.path.forEach((f, i) => map.getSource(`radar-source-${i}`).setTiles([`${radarData.host}${f.path}/512/{z}/{x}/{y}/6/1_1.png`]));
    } else if (val === 'tmd-sim') {
        currentRadarName.textContent = 'TMD Stations (Simulated)';
        document.getElementById('legend-tmd').classList.remove('hidden');
        radarData.path.forEach((f, i) => map.getSource(`radar-source-${i}`).setTiles([`${radarData.host}${f.path}/512/{z}/{x}/{y}/2/1_1.png`]));
    } else if (val === 'tmd-actual') {
        currentRadarName.textContent = 'TMD Official (Select Station)';
        document.getElementById('legend-tmd').classList.remove('hidden');
        map.setLayoutProperty('tmd-actual-layer', 'visibility', 'visible');
        
        // Spawn Real TMD Markers
        tmdStations.forEach(st => {
            const el = document.createElement('div');
            el.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`;
            el.style.cursor = 'pointer';
            el.style.background = 'rgba(0,0,0,0.5)';
            el.style.borderRadius = '50%';
            
            const marker = new mapboxgl.Marker(el).setLngLat(st.center).addTo(map);
            el.addEventListener('click', () => {
                activeTmdStation = st;
                currentRadarName.textContent = `TMD: ${st.name}`;
                const proxyUrl = `https://corsproxy.io/?url=http://weather.tmd.go.th/${st.url}`;
                map.getSource('tmd-actual-source').updateImage({ url: proxyUrl, coordinates: st.bounds });
                map.flyTo({ center: st.center, zoom: 7 });
                
                currentRadarImg = new Image();
                currentRadarImg.crossOrigin = "Anonymous";
                currentRadarImg.onload = () => {
                    hiddenCanvas.width = currentRadarImg.width;
                    hiddenCanvas.height = currentRadarImg.height;
                    hiddenCtx.drawImage(currentRadarImg, 0, 0);
                };
                currentRadarImg.src = proxyUrl;
            });
            tmdMarkers.push(marker);
        });
        map.flyTo({ center: [100.5, 13.7], zoom: 5 });
    }
    updateFrame(currentFrameIndex);
});

// Weather Overlays
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
    [btnInspector, btnSounding, btnSimulateStorm, btnDrawFree, btnDrawLine, btnErase].forEach(b => b.classList.remove('active'));
    map.dragPan.enable();
    drawCanvas.style.pointerEvents = 'none';
    stormTrajectoryCoords = [];
    stormData.features = [];
    map.getSource('storm-source').setData(stormData);

    if (mode === 'dbz') {
        btnInspector.classList.add('active'); map.getCanvas().style.cursor = 'crosshair';
    } else if (mode === 'sounding') {
        btnSounding.classList.add('active'); map.getCanvas().style.cursor = 'help';
    } else if (mode === 'storm') {
        btnSimulateStorm.classList.add('active'); map.getCanvas().style.cursor = 'crosshair';
        alert("Storm Tracker: Click to place points. Double-Click to finish and start camera tracking.");
    } else if (mode.startsWith('draw') || mode === 'erase') {
        document.getElementById('btn-' + mode.replace('_','-')).classList.add('active');
        map.dragPan.disable();
        drawCanvas.style.pointerEvents = 'auto';
        drawCanvas.style.cursor = mode === 'erase' ? 'cell' : 'crosshair';
    } else {
        map.getCanvas().style.cursor = '';
    }
}

btnInspector.addEventListener('click', () => setMode(activeMode === 'dbz' ? 'none' : 'dbz'));
btnSounding.addEventListener('click', () => setMode(activeMode === 'sounding' ? 'none' : 'sounding'));
btnSimulateStorm.addEventListener('click', () => setMode(activeMode === 'storm' ? 'none' : 'storm'));

// Drawing Canvas Undo/Redo
btnDrawFree.addEventListener('click', () => setMode('draw_free'));
btnDrawLine.addEventListener('click', () => setMode('draw_line'));
btnErase.addEventListener('click', () => setMode('erase'));
btnEraseAll.addEventListener('click', () => { strokes = []; drawUndoStack = []; renderCanvas(); });

btnDrawUndo.addEventListener('click', () => {
    if (strokes.length > 0) {
        drawUndoStack.push(strokes.pop());
        renderCanvas();
    }
});
btnDrawRedo.addEventListener('click', () => {
    if (drawUndoStack.length > 0) {
        strokes.push(drawUndoStack.pop());
        renderCanvas();
    }
});

brushSizeInput.addEventListener('input', e => brushSizeLabel.textContent = `Brush: ${e.target.value}px`);
eraserSizeInput.addEventListener('input', e => eraserSizeLabel.textContent = `${e.target.value}px`);

function setupCanvasEngine() {
    drawCanvas.addEventListener('mousedown', (e) => {
        if (!['draw_free', 'draw_line', 'erase'].includes(activeMode)) return;
        isDrawing = true;
        drawUndoStack = []; // clear redo on new action
        const lngLat = map.unproject([e.offsetX, e.offsetY]);
        currentStroke = { type: activeMode === 'erase' ? 'erase' : 'draw', color: drawColorInput.value, width: activeMode === 'erase' ? parseInt(eraserSizeInput.value) : parseInt(brushSizeInput.value), points: [[lngLat.lng, lngLat.lat]] };
        strokes.push(currentStroke);
    });

    drawCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || !currentStroke) return;
        const lngLat = map.unproject([e.offsetX, e.offsetY]);
        if (activeMode === 'draw_line') currentStroke.points[1] = [lngLat.lng, lngLat.lat];
        else currentStroke.points.push([lngLat.lng, lngLat.lat]);
        renderCanvas();
    });

    drawCanvas.addEventListener('mouseup', () => { isDrawing = false; currentStroke = null; });
    drawCanvas.addEventListener('mouseleave', () => { isDrawing = false; currentStroke = null; });
}

// Interaction Tracking
function setupInteractionListeners() {
    map.on('mousemove', (e) => {
        if (activeMode === 'dbz') {
            dbzTooltip.classList.remove('hidden');
            dbzTooltip.style.left = e.point.x + 15 + 'px';
            dbzTooltip.style.top = e.point.y + 15 + 'px';
            
            if (radarSourceSelect.value === 'tmd-actual' && activeTmdStation && currentRadarImg && currentRadarImg.complete) {
                const bounds = activeTmdStation.bounds;
                const pxX = ((e.lngLat.lng - bounds[0][0]) / (bounds[1][0] - bounds[0][0])) * hiddenCanvas.width;
                const pxY = ((bounds[0][1] - e.lngLat.lat) / (bounds[0][1] - bounds[2][1])) * hiddenCanvas.height;
                
                if (pxX >= 0 && pxX < hiddenCanvas.width && pxY >= 0 && pxY < hiddenCanvas.height) {
                    const px = hiddenCtx.getImageData(pxX, pxY, 1, 1).data;
                    let dbz = '--';
                    if(px[3] > 0) dbz = Math.floor((px[0] + px[1] + px[2]) / 3 / 2.5);
                    dbzTooltip.querySelector('.dbz-val').textContent = dbz;
                } else { dbzTooltip.querySelector('.dbz-val').textContent = '--'; }
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
        if (activeMode === 'sounding') {
            soundingModal.classList.add('visible');
            setMode('none');
        }
        if (activeMode === 'storm') {
            stormTrajectoryCoords.push([e.lngLat.lng, e.lngLat.lat]);
            stormData.features = stormTrajectoryCoords.map(c => turf.point(c));
            if (stormTrajectoryCoords.length > 1) stormData.features.push(turf.lineString(stormTrajectoryCoords));
            map.getSource('storm-source').setData(stormData);
        }
    });

    // End Storm Tracker via double click
    map.on('dblclick', (e) => {
        if (activeMode === 'storm' && stormTrajectoryCoords.length > 1) {
            setMode('none');
            // Animate Camera along path
            let idx = 0;
            const flight = setInterval(() => {
                if(idx >= stormTrajectoryCoords.length) { clearInterval(flight); return; }
                map.flyTo({ center: stormTrajectoryCoords[idx], zoom: 9, pitch: 45, speed: 0.5 });
                idx++;
            }, 3000);
        }
    });
}

// Lightning Simulator
toggleLightning.addEventListener('change', (e) => {
    if (e.target.checked) {
        lightningInterval = setInterval(() => {
            const lat = 13.7 + (Math.random() - 0.5) * 3;
            const lng = 100.5 + (Math.random() - 0.5) * 3;
            const el = document.createElement('div');
            el.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="yellow" stroke="orange" stroke-width="1"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
            el.style.transition = 'opacity 120s linear';
            el.style.opacity = '1';
            const marker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map);
            setTimeout(() => { el.style.opacity = '0'; }, 100);
            setTimeout(() => { marker.remove(); }, 120000);
        }, 1500);
    } else { clearInterval(lightningInterval); }
});

// Warning System Logic (45 max)
btnShowWarnings.addEventListener('click', () => warningWidget.classList.remove('hidden'));
btnCloseWarnings.addEventListener('click', () => warningWidget.classList.add('hidden'));

function renderWarnings() {
    warningList.innerHTML = '';
    warningBadge.textContent = activeWarnings.length;
    activeWarnings.slice().reverse().forEach(w => {
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

function initWarningSystem() {
    // Initial Warning
    activeWarnings.push({ title: 'TMD: Heavy Rain Watch', loc: [98.98, 18.78], type: 'flood', time: new Date().toLocaleTimeString(), desc: 'Heavy rain across northern Thailand.' });
    renderWarnings();
    
    // Simulate incoming warnings
    warningSimInterval = setInterval(() => {
        if(activeWarnings.length >= 45) activeWarnings.shift(); // Remove oldest
        const types = ['flood', 'storm'];
        const type = types[Math.floor(Math.random()*types.length)];
        activeWarnings.push({
            title: `TMD Warning: ${type === 'storm' ? 'Severe Thunderstorm' : 'Flash Flood'}`,
            loc: [100.5 + (Math.random()-0.5)*5, 13.7 + (Math.random()-0.5)*5],
            type: type,
            time: new Date().toLocaleTimeString(),
            desc: 'Official TMD Alert generated for this location.'
        });
        renderWarnings();
    }, 20000); // New warning every 20s for demonstration
}

// Sounding Modal UI
btnCloseSounding.addEventListener('click', () => soundingModal.classList.remove('visible'));
btnTabSkewt.addEventListener('click', () => { btnTabSkewt.classList.add('active'); btnTabHodo.classList.remove('active'); skewtView.classList.add('active'); hodoView.classList.remove('active'); });
btnTabHodo.addEventListener('click', () => { btnTabHodo.classList.add('active'); btnTabSkewt.classList.remove('active'); hodoView.classList.add('active'); skewtView.classList.remove('active'); });

// GPS
gpsBtn.addEventListener('click', () => { if (geolocateControl) geolocateControl.trigger(); });

checkToken();
