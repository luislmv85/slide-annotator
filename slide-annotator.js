/**
 * slide-annotator.js — Standalone drawing overlay for HTML presentations
 * Zero dependencies. PDF export loads html2canvas + jsPDF from CDN on demand.
 */
(function() {
'use strict';

var canvas, ctx, badge, colorModal;
var sliderWidth, sliderOpacity, sliderFill;
var drawMode = false;
var currentTool = 'pen';
var shapeFill = false;
var isDrawing = false;
var startX = 0, startY = 0;
var currentStroke = null;
var slideDrawings = {};
var DRAW_COLOR = '#ff4444';
var canvasHidden = false;
var laserTrail = [];
var laserAnimFrame = null;
var gKeyHeld = false;
var lastMousePos = { x: -1, y: -1 };
var LASER_FADE_MS = 1500;
var STORAGE_KEY = '';
var STORAGE_VERSION = 2;

var COLOR_PALETTE = ['#ff4444','#ff9f1a','#ffdd57','#48c774','#3298dc','#b86bff','#ff6bcb','#ffffff','#7a8894'];

var TOOL_SETTINGS = {
    pen:         { width: 3, opacity: 1.0 },
    rect:        { width: 3, opacity: 1.0, fillOpacity: 0.15 },
    ellipse:     { width: 3, opacity: 1.0, fillOpacity: 0.15 },
    arrow:       { width: 3, opacity: 1.0 },
    callout:     { width: 3, opacity: 1.0 },
    crossout:    { width: 3, opacity: 1.0 },
    laser:       { width: 3 },
    highlighter: { width: 20, opacity: 0.3 }
};

var opts = {};

function getSlideIndex() { return opts.getSlideIndex ? opts.getSlideIndex() : 0; }
function setSlideIndex(n) { if (opts.setSlideIndex) opts.setSlideIndex(n); }
function getToolWidth() { return TOOL_SETTINGS[currentTool]?.width ?? 3; }
function getToolOpacity() { return TOOL_SETTINGS[currentTool]?.opacity ?? 1.0; }
function getToolFillOpacity() { return TOOL_SETTINGS[currentTool]?.fillOpacity ?? 0.15; }
function hexToRgba(hex, alpha) {
    if (!hex || !hex.startsWith('#')) return 'rgba(255,68,68,' + alpha + ')';
    return 'rgba(' + parseInt(hex.slice(1,3),16) + ',' + parseInt(hex.slice(3,5),16) + ',' + parseInt(hex.slice(5,7),16) + ',' + alpha + ')';
}
function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
function getCalloutBg() { return (opts.theme === 'light') ? '#ffffff' : '#15202b'; }
function getCalloutTextColor() { return (opts.theme === 'light') ? '#000' : '#fff'; }

// --- Storage ---
function saveToStorage() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ _version: STORAGE_VERSION, data: slideDrawings })); } catch(e) {}
}
function loadFromStorage() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) { slideDrawings = {}; return; }
        var parsed = JSON.parse(raw);
        if (parsed && parsed._version === STORAGE_VERSION) { slideDrawings = parsed.data || {}; }
        else { slideDrawings = {}; saveToStorage(); }
    } catch(e) { slideDrawings = {}; }
}
function getStrokes() {
    var idx = getSlideIndex();
    if (!slideDrawings[idx]) slideDrawings[idx] = [];
    return slideDrawings[idx];
}


// --- Drawing primitives ---
function drawArrow(c, x1, y1, x2, y2, color, width) {
    var headLen = 8 + width * 2;
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var lineEndX = x2 - headLen * Math.cos(angle);
    var lineEndY = y2 - headLen * Math.sin(angle);
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = width; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(lineEndX, lineEndY); c.stroke();
    c.beginPath(); c.moveTo(x2, y2);
    c.lineTo(x2 - headLen * Math.cos(angle - Math.PI/6), y2 - headLen * Math.sin(angle - Math.PI/6));
    c.lineTo(x2 - headLen * Math.cos(angle + Math.PI/6), y2 - headLen * Math.sin(angle + Math.PI/6));
    c.closePath(); c.fill();
}

function wrapText(c, text, maxWidth, maxLines) {
    maxLines = maxLines || 6;
    var words = text.split(' '), lines = [], line = '';
    c.font = '14px sans-serif';
    for (var wi = 0; wi < words.length; wi++) {
        var w = words[wi];
        if (c.measureText(w).width > maxWidth) {
            if (line) { lines.push(line); line = ''; }
            var chunk = '';
            for (var ci = 0; ci < w.length; ci++) {
                if (c.measureText(chunk + w[ci]).width > maxWidth && chunk) { lines.push(chunk); chunk = w[ci]; }
                else { chunk += w[ci]; }
                if (lines.length >= maxLines) break;
            }
            if (chunk) line = chunk;
        } else {
            var test = line ? line + ' ' + w : w;
            if (c.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
            else { line = test; }
        }
        if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length >= maxLines) { lines.length = maxLines; lines[maxLines-1] = lines[maxLines-1].slice(0,-3) + '...'; }
    return lines;
}

function renderCalloutOnCtx(c, s, W, H) {
    if (!s.text) return;
    var pad = 10, lineH = 18, maxW = 250;
    c.font = '14px sans-serif';
    var lines = wrapText(c, s.text, maxW);
    var textW = Math.min(maxW, Math.max.apply(null, lines.map(function(l){ return c.measureText(l).width; })));
    var boxW = textW + pad*2, boxH = lines.length * lineH + pad*2;
    var boxPx = s.boxX * W, boxPy = s.boxY * H;
    var bx = boxPx - boxW/2, by = boxPy - boxH/2;
    c.fillStyle = getCalloutBg(); c.strokeStyle = s.color || DRAW_COLOR; c.lineWidth = s.lineWidth || 1.5;
    c.beginPath(); c.roundRect(bx, by, boxW, boxH, 4); c.fill(); c.stroke();
    var prevAlpha = c.globalAlpha; c.globalAlpha = 1;
    c.fillStyle = getCalloutTextColor(); c.font = '14px sans-serif'; c.textBaseline = 'top';
    for (var i = 0; i < lines.length; i++) c.fillText(lines[i], bx + pad, by + pad + i * lineH);
    c.globalAlpha = prevAlpha;
    var edgeX = boxPx, targetPy = s.targetY * H;
    var edgeY = targetPy < boxPy ? by : by + boxH;
    var showArrow = s.hasArrow !== undefined ? s.hasArrow : true;
    if (showArrow) drawArrow(c, edgeX, edgeY, s.targetX * W, targetPy, s.color || DRAW_COLOR, s.lineWidth || 2);
}


// --- Render stroke ---
function renderStroke(s) {
    var W = canvas.width, H = canvas.height;
    ctx.save();
    ctx.strokeStyle = s.color || DRAW_COLOR;
    ctx.lineWidth = s.lineWidth || 3;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.tool !== 'crossout') ctx.globalAlpha = s.opacity ?? 1.0;
    if (s.tool === 'pen' || s.tool === 'highlighter') {
        if (s.points.length < 2) { ctx.restore(); return; }
        ctx.beginPath(); ctx.moveTo(s.points[0][0]*W, s.points[0][1]*H);
        if (s.points.length === 2) { ctx.lineTo(s.points[1][0]*W, s.points[1][1]*H); }
        else {
            for (var i = 1; i < s.points.length-1; i++) {
                var x1 = s.points[i][0]*W, y1 = s.points[i][1]*H;
                var x2 = s.points[i+1][0]*W, y2 = s.points[i+1][1]*H;
                ctx.quadraticCurveTo(x1, y1, (x1+x2)/2, (y1+y2)/2);
            }
            var last = s.points[s.points.length-1]; ctx.lineTo(last[0]*W, last[1]*H);
        }
        ctx.stroke();
    } else if (s.tool === 'rect') {
        var rx1=s.x1*W, ry1=s.y1*H, rx2=s.x2*W, ry2=s.y2*H;
        if (s.filled) { var pa=ctx.globalAlpha; ctx.globalAlpha=s.fillOpacity??0.15; ctx.fillStyle=s.color||DRAW_COLOR; ctx.fillRect(rx1,ry1,rx2-rx1,ry2-ry1); ctx.globalAlpha=pa; }
        ctx.beginPath(); ctx.rect(rx1,ry1,rx2-rx1,ry2-ry1); ctx.stroke();
    } else if (s.tool === 'ellipse') {
        var ex1=s.x1*W, ey1=s.y1*H, ex2=s.x2*W, ey2=s.y2*H;
        var ecx=(ex1+ex2)/2, ecy=(ey1+ey2)/2, erx=Math.abs(ex2-ex1)/2, ery=Math.abs(ey2-ey1)/2;
        ctx.beginPath(); ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI*2);
        if (s.filled) { var pa2=ctx.globalAlpha; ctx.globalAlpha=s.fillOpacity??0.15; ctx.fillStyle=s.color||DRAW_COLOR; ctx.fill(); ctx.globalAlpha=pa2; }
        ctx.stroke();
    } else if (s.tool === 'arrow') {
        drawArrow(ctx, s.x1*W, s.y1*H, s.x2*W, s.y2*H, s.color||DRAW_COLOR, s.lineWidth||3);
    } else if (s.tool === 'crossout') {
        var cx1=s.x1*W, cy1=s.y1*H, cx2=s.x2*W, cy2=s.y2*H, cw=cx2-cx1, ch=cy2-cy1, m=0.05;
        ctx.fillStyle='rgba(0,0,0,0.15)'; ctx.fillRect(cx1,cy1,cw,ch);
        ctx.lineWidth=1.5; ctx.globalAlpha=0.4; ctx.setLineDash([6,4]);
        ctx.beginPath(); ctx.rect(cx1,cy1,cw,ch); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha=s.opacity??1.0; ctx.lineWidth=s.lineWidth||3;
        ctx.beginPath();
        ctx.moveTo(cx1+cw*m, cy1+ch*m); ctx.lineTo(cx2-cw*m, cy2-ch*m);
        ctx.moveTo(cx2-cw*m, cy1+ch*m); ctx.lineTo(cx1+cw*m, cy2-ch*m);
        ctx.stroke();
    } else if (s.tool === 'callout') {
        renderCalloutOnCtx(ctx, s, W, H);
    }
    ctx.restore();
}

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    getStrokes().forEach(function(s) { renderStroke(s); });
}


// --- Laser ---
function animateLaser() {
    var now = Date.now();
    laserTrail = laserTrail.filter(function(p) { return now - p.time < LASER_FADE_MS; });
    redrawCanvas();
    if (laserTrail.length > 2) {
        var lw = TOOL_SETTINGS.laser.width;
        for (var i = 1; i < laserTrail.length-1; i++) {
            if (laserTrail[i].time - laserTrail[i-1].time > 100) continue;
            var age = (now - laserTrail[i].time) / LASER_FADE_MS;
            ctx.strokeStyle = hexToRgba(DRAW_COLOR, Math.max(0, 1-age));
            ctx.lineWidth = lw; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
            var x0=laserTrail[i-1].x*canvas.width, y0=laserTrail[i-1].y*canvas.height;
            var x1=laserTrail[i].x*canvas.width, y1=laserTrail[i].y*canvas.height;
            ctx.beginPath(); ctx.moveTo((x0+x1)/2, (y0+y1)/2);
            if (laserTrail[i+1].time - laserTrail[i].time > 100) { ctx.lineTo(x1, y1); }
            else { var x2=laserTrail[i+1].x*canvas.width, y2=laserTrail[i+1].y*canvas.height; ctx.quadraticCurveTo(x1, y1, (x1+x2)/2, (y1+y2)/2); }
            ctx.stroke();
        }
    } else if (laserTrail.length === 2 && laserTrail[1].time - laserTrail[0].time <= 100) {
        ctx.strokeStyle = hexToRgba(DRAW_COLOR, Math.max(0, 1-(Date.now()-laserTrail[1].time)/LASER_FADE_MS));
        ctx.lineWidth = TOOL_SETTINGS.laser.width; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(laserTrail[0].x*canvas.width, laserTrail[0].y*canvas.height);
        ctx.lineTo(laserTrail[1].x*canvas.width, laserTrail[1].y*canvas.height); ctx.stroke();
    }
    if (laserTrail.length > 0) { laserAnimFrame = requestAnimationFrame(animateLaser); }
    else { laserAnimFrame = null; redrawCanvas(); }
}
function stopLaser() { laserTrail = []; if (laserAnimFrame) { cancelAnimationFrame(laserAnimFrame); laserAnimFrame = null; } }

// --- Canvas visibility and draw mode ---
function toggleCanvasVisibility() {
    canvasHidden = !canvasHidden;
    canvas.style.opacity = canvasHidden ? '0' : '1';
    updateBadge();
}
function setDrawMode(on) {
    drawMode = on;
    if (on && canvasHidden) toggleCanvasVisibility();
    if (!on) stopLaser();
    canvas.style.pointerEvents = on ? 'all' : 'none';
    updateBadge();
}


// --- Cursors and badge ---
function getToolCursor(tool) {
    var hex = DRAW_COLOR.replace('#', '%23');
    var fill = shapeFill ? hex : 'none';
    var fo = shapeFill ? " fill-opacity='0.3'" : '';
    var cursors = {
        pen: "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z' fill='" + hex + "'/><path d='M20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' fill='" + hex + "'/></svg>\") 2 22, crosshair",
        rect: "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect x='3' y='3' width='18' height='18' rx='2' fill='" + fill + "'" + fo + " stroke='" + hex + "' stroke-width='2.5'/></svg>\") 12 12, crosshair",
        ellipse: "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><ellipse cx='12' cy='12' rx='9' ry='6' fill='" + fill + "'" + fo + " stroke='" + hex + "' stroke-width='2.5'/></svg>\") 12 12, crosshair",
        arrow: "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M20 4L4 20' stroke='" + hex + "' stroke-width='2.5' stroke-linecap='round'/><path d='M4 20l2-8 6 6z' fill='" + hex + "'/></svg>\") 4 20, crosshair",
        callout: "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M4 4h16v12H8l-4 4V4z' fill='none' stroke='" + hex + "' stroke-width='2' stroke-linejoin='round'/><text x='8' y='14' font-size='10' fill='" + hex + "' font-family='sans-serif' font-weight='bold'>T</text></svg>\") 4 4, text",
        crossout: "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect x='3' y='3' width='18' height='18' rx='2' fill='" + hex + "' fill-opacity='0.1' stroke='" + hex + "' stroke-width='1.5' stroke-dasharray='3 2' opacity='0.5'/><path d='M5 5l14 14M19 5l-14 14' stroke='" + hex + "' stroke-width='2.5' stroke-linecap='round'/></svg>\") 12 12, crosshair",
        laser: "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='12' cy='12' r='5' fill='" + hex + "' opacity='0.9'/><circle cx='12' cy='12' r='8' fill='none' stroke='" + hex + "' stroke-width='1.5' opacity='0.5'/></svg>\") 12 12, crosshair",
        highlighter: "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M4 14l16-6' stroke='" + hex + "' stroke-width='6' stroke-linecap='round' opacity='0.5'/></svg>\") 12 12, crosshair"
    };
    return cursors[tool] || 'crosshair';
}

function updateBadge() {
    if (drawMode) {
        var names = { pen:'PEN', rect:'RECT', ellipse:'ELLIPSE', arrow:'ARROW', callout:'TEXT', crossout:'CROSS', laser:'LASER', highlighter:'HIGH' };
        var name = names[currentTool] || currentTool;
        if (shapeFill && (currentTool === 'rect' || currentTool === 'ellipse')) name += ' (F)';
        badge.textContent = 'DRAW: ' + name;
        badge.style.display = 'block';
        badge.style.background = DRAW_COLOR;
        badge.style.color = ['#ffffff','#ffdd57'].includes(DRAW_COLOR) ? '#000' : '#fff';
        canvas.style.cursor = getToolCursor(currentTool);
    } else if (canvasHidden) {
        badge.textContent = 'HIDDEN';
        badge.style.display = 'block';
        badge.style.background = '#556';
        badge.style.color = '#fff';
    } else {
        badge.style.display = 'none';
        canvas.style.cursor = 'default';
    }
}


// --- Color Modal ---
function createColorModal() {
    colorModal = document.createElement('div');
    colorModal.style.cssText = 'display:none;position:fixed;z-index:10001;background:#1a2733;border:2px solid #3a4a5a;border-radius:12px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.6);';
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;';
    COLOR_PALETTE.forEach(function(c) {
        var swatch = document.createElement('div');
        swatch.style.cssText = 'width:50px;height:50px;border-radius:10px;cursor:pointer;background:'+c+';border:3px solid transparent;transition:border-color 0.15s,transform 0.1s;';
        if (c === '#ffffff') swatch.style.border = '3px solid #555';
        swatch.onmouseenter = function() { swatch.style.transform='scale(1.15)'; };
        swatch.onmouseleave = function() { swatch.style.transform='scale(1)'; };
        swatch.onclick = function() { DRAW_COLOR = c; colorModal.style.display='none'; updateBadge(); };
        grid.appendChild(swatch);
    });
    colorModal.appendChild(grid);

    var cDiv = document.createElement('div');
    cDiv.style.cssText = 'margin-top:14px;display:flex;flex-direction:column;gap:8px;width:174px;';
    function makeSlider(label, min, max, step, value, onChange) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;width:174px;';
        var lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:11px;color:#8899a6;width:50px;flex-shrink:0;';
        lbl.textContent = label;
        var input = document.createElement('input');
        input.type='range'; input.min=min; input.max=max; input.step=step; input.value=value;
        input.style.cssText = 'flex:1;height:5px;cursor:pointer;accent-color:#3298dc;min-width:0;';
        var val = document.createElement('span');
        val.style.cssText = 'font-size:11px;color:#ccc;width:24px;text-align:right;flex-shrink:0;';
        val.textContent = value;
        input.oninput = function() { val.textContent=input.value; onChange(parseFloat(input.value)); };
        row.appendChild(lbl); row.appendChild(input); row.appendChild(val);
        row._input = input; row._val = val;
        return row;
    }
    sliderWidth = makeSlider('Grosor', 1, 25, 0.5, 3, function(v){ TOOL_SETTINGS[currentTool].width=v; });
    sliderOpacity = makeSlider('Opacidad', 0.1, 1.0, 0.05, 1.0, function(v){ TOOL_SETTINGS[currentTool].opacity=v; });
    sliderFill = makeSlider('Relleno', 0.05, 0.5, 0.05, 0.15, function(v){ TOOL_SETTINGS[currentTool].fillOpacity=v; });
    cDiv.appendChild(sliderWidth); cDiv.appendChild(sliderOpacity); cDiv.appendChild(sliderFill);
    colorModal.appendChild(cDiv);
    document.body.appendChild(colorModal);
}

function syncSliders() {
    var ts = TOOL_SETTINGS[currentTool];
    sliderWidth._input.value = ts.width ?? 3; sliderWidth._val.textContent = ts.width ?? 3;
    if (ts.opacity !== undefined) { sliderOpacity.style.display='flex'; sliderOpacity._input.value=ts.opacity; sliderOpacity._val.textContent=ts.opacity; }
    else { sliderOpacity.style.display='none'; }
    if (ts.fillOpacity !== undefined && shapeFill) { sliderFill.style.display='flex'; sliderFill._input.value=ts.fillOpacity; sliderFill._val.textContent=ts.fillOpacity; }
    else { sliderFill.style.display='none'; }
}

function toggleColorPalette() {
    if (colorModal.style.display !== 'none') { colorModal.style.display='none'; return; }
    syncSliders();
    colorModal.style.display = 'block';
    var mW=colorModal.offsetWidth, mH=colorModal.offsetHeight, vW=window.innerWidth, vH=window.innerHeight;
    var margin=0.05, minX=vW*margin, maxX=vW*(1-margin)-mW, minY=vH*margin, maxY=vH*(1-margin)-mH;
    var mx=lastMousePos.x, my=lastMousePos.y;
    if (mx >= 0 && my >= 0 && mx <= vW && my <= vH) {
        colorModal.style.left = Math.max(minX, Math.min(maxX, mx-mW/2)) + 'px';
        colorModal.style.top = Math.max(minY, Math.min(maxY, my-mH/2)) + 'px';
    } else {
        colorModal.style.left = (vW/2 - mW/2) + 'px';
        colorModal.style.top = (vH/2 - mH/2) + 'px';
    }
}


// --- Mouse handlers ---
function setupMouseHandlers() {
    canvas.addEventListener('mousemove', function(e) { lastMousePos.x=e.clientX; lastMousePos.y=e.clientY; }, {passive:true});
    canvas.addEventListener('mouseleave', function() { lastMousePos.x=-1; lastMousePos.y=-1; }, {passive:true});

    canvas.addEventListener('mousedown', function(e) {
        if (!drawMode) return;
        if (currentTool === 'laser') { isDrawing = true; return; }
        isDrawing = true;
        startX = e.clientX / canvas.width; startY = e.clientY / canvas.height;
        if (currentTool === 'pen' || currentTool === 'highlighter') {
            currentStroke = { tool: currentTool, points: [[startX, startY]], color: DRAW_COLOR, lineWidth: getToolWidth(), opacity: getToolOpacity() };
        } else {
            var filled = (currentTool === 'rect' || currentTool === 'ellipse') ? shapeFill : false;
            currentStroke = { tool: currentTool, x1: startX, y1: startY, x2: startX, y2: startY, color: DRAW_COLOR, lineWidth: getToolWidth(), opacity: getToolOpacity(), fillOpacity: getToolFillOpacity(), filled: filled };
        }
    });

    canvas.addEventListener('mousemove', function(e) {
        if (!drawMode) return;
        if (currentTool === 'laser') {
            if (!isDrawing) return;
            laserTrail.push({ x: e.clientX/canvas.width, y: e.clientY/canvas.height, time: Date.now() });
            if (!laserAnimFrame) laserAnimFrame = requestAnimationFrame(animateLaser);
            return;
        }
        if (!isDrawing) return;
        var nx = e.clientX/canvas.width, ny = e.clientY/canvas.height;
        if (currentTool === 'pen' || currentTool === 'highlighter') {
            var py = (currentTool === 'highlighter' && gKeyHeld) ? currentStroke.points[0][1] : ny;
            currentStroke.points.push([nx, py]);
            redrawCanvas(); renderStroke(currentStroke);
        } else if (currentTool === 'callout') {
            redrawCanvas();
            var dx = e.clientX - startX*canvas.width, dy = e.clientY - startY*canvas.height;
            if (Math.sqrt(dx*dx + dy*dy) > 30) drawArrow(ctx, e.clientX, e.clientY, startX*canvas.width, startY*canvas.height, DRAW_COLOR, 2);
        } else {
            currentStroke.x2 = nx; currentStroke.y2 = ny;
            redrawCanvas(); renderStroke(currentStroke);
        }
    });

    canvas.addEventListener('mouseup', function(e) {
        if (!isDrawing || !drawMode) return;
        isDrawing = false;
        if (currentTool === 'laser') return;
        if (currentTool === 'callout') {
            var text = prompt('Texto de la anotación:');
            if (text && text.trim()) {
                var bx = e.clientX/canvas.width, by = e.clientY/canvas.height;
                var dx = (bx-startX)*canvas.width, dy = (by-startY)*canvas.height;
                var hasArrow = Math.sqrt(dx*dx + dy*dy) > 30;
                getStrokes().push({ tool:'callout', targetX:startX, targetY:startY, boxX:bx, boxY:by, text:text.trim(), color:DRAW_COLOR, lineWidth:getToolWidth(), hasArrow:hasArrow, opacity:getToolOpacity() });
            }
            currentStroke = null; redrawCanvas(); saveToStorage(); return;
        }
        if (currentTool !== 'pen' && currentTool !== 'highlighter') {
            currentStroke.x2 = e.clientX/canvas.width; currentStroke.y2 = e.clientY/canvas.height;
        }
        if (currentTool === 'arrow') {
            var adx = (currentStroke.x2-currentStroke.x1)*canvas.width, ady = (currentStroke.y2-currentStroke.y1)*canvas.height;
            if (Math.sqrt(adx*adx + ady*ady) < 20) { currentStroke=null; redrawCanvas(); return; }
        }
        getStrokes().push(currentStroke);
        currentStroke = null; redrawCanvas(); saveToStorage();
    });

    canvas.addEventListener('mouseleave', function() {
        if (isDrawing && drawMode && currentStroke) {
            getStrokes().push(currentStroke); currentStroke=null; isDrawing=false; redrawCanvas(); saveToStorage();
        }
    });
}


// --- Keyboard handlers ---
function setupKeyboardHandlers() {
    document.addEventListener('keydown', function(e) { if (e.key.toLowerCase() === 'g') gKeyHeld = true; });
    document.addEventListener('keyup', function(e) { if (e.key.toLowerCase() === 'g') gKeyHeld = false; });

    document.addEventListener('keydown', function(e) {
        var key = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && key === 'e') { e.preventDefault(); exportPDF(); return; }
        if (key === 'f' && !drawMode) { e.preventDefault(); openPresentationPopup(); return; }
        if (key === 'h') { e.preventDefault(); if (drawMode) setDrawMode(false); toggleCanvasVisibility(); return; }
        if (key === 'd') { e.preventDefault(); setDrawMode(!drawMode); return; }
        if (key === 'escape' && drawMode) { e.preventDefault(); colorModal.style.display='none'; setDrawMode(false); return; }
        if (drawMode) {
            if (key === 'c') { e.preventDefault(); toggleColorPalette(); return; }
            if (key === 'p') { stopLaser(); currentTool='pen'; updateBadge(); return; }
            if (key === 'r') { stopLaser(); if (currentTool==='rect') shapeFill=!shapeFill; else currentTool='rect'; updateBadge(); return; }
            if (key === 'e') { stopLaser(); if (currentTool==='ellipse') shapeFill=!shapeFill; else currentTool='ellipse'; updateBadge(); return; }
            if (key === 'a') { stopLaser(); currentTool='arrow'; updateBadge(); return; }
            if (key === 't') { stopLaser(); currentTool='callout'; updateBadge(); return; }
            if (key === 'x') { stopLaser(); currentTool='crossout'; updateBadge(); return; }
            if (key === 'l') { stopLaser(); currentTool='laser'; updateBadge(); return; }
            if (key === 'g') { stopLaser(); currentTool='highlighter'; updateBadge(); return; }
            if (e.key === 'Delete') { slideDrawings[getSlideIndex()]=[]; redrawCanvas(); saveToStorage(); return; }
            if (key === 'z') { var st=getStrokes(); if(st.length){st.pop(); redrawCanvas(); saveToStorage();} return; }
        }
    });
}

// --- PDF Export ---
function loadScript(url) {
    return new Promise(function(resolve, reject) {
        var s = document.createElement('script'); s.src=url; s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
    });
}

async function exportPDF() {
    var cdnH = opts.cdnHtml2canvas || 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    var cdnJ = opts.cdnJspdf || 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
    if (typeof html2canvas === 'undefined') { badge.textContent='LOADING...'; badge.style.display='block'; badge.style.background='#1da1f2'; try { await loadScript(cdnH); } catch(e) { alert('Error cargando html2canvas'); return; } }
    if (typeof window.jspdf === 'undefined') { try { await loadScript(cdnJ); } catch(e) { alert('Error cargando jsPDF'); return; } }

    badge.textContent='EXPORTING...'; badge.style.display='block'; badge.style.background='#1da1f2';
    var slidesSel = opts.slides || '.slide';
    var slideEls = document.querySelectorAll(slidesSel);
    var originalSlide = getSlideIndex();
    var wasDrawMode = drawMode;
    if (drawMode) setDrawMode(false);

    try {
        await delay(200);
        var jsPDF = window.jspdf.jsPDF;
        var w = window.innerWidth, h = window.innerHeight;
        var pdf = new jsPDF({ orientation:'landscape', unit:'px', format:[w,h] });
        canvas.style.display = 'none';

        for (var i = 0; i < slideEls.length; i++) {
            setSlideIndex(i); await delay(100);
            badge.textContent = 'EXPORTING ' + (i+1) + '/' + slideEls.length;
            var capture = await html2canvas(document.body, {
                useCORS:true, scale:2, width:w, height:h,
                backgroundColor: opts.theme==='light' ? '#ffffff' : '#0f1419',
                scrollX:0, scrollY:0,
                ignoreElements: function(el) { return el===badge || el===canvas || el===colorModal; },
                onclone: function(doc) { doc.querySelectorAll(slidesSel).forEach(function(s){ s.style.animation='none'; s.style.opacity='1'; s.style.transform='none'; }); }
            });
            var strokes = slideDrawings[i] || [];
            if (strokes.length) {
                var tmp = document.createElement('canvas'); tmp.width=w; tmp.height=h;
                var tc = tmp.getContext('2d');
                strokes.forEach(function(s) {
                    tc.save(); tc.strokeStyle=s.color||DRAW_COLOR; tc.lineWidth=s.lineWidth||3; tc.lineCap='round'; tc.lineJoin='round';
                    if (s.tool !== 'crossout') tc.globalAlpha = s.opacity ?? 1.0;
                    if ((s.tool==='pen'||s.tool==='highlighter') && s.points && s.points.length>=2) {
                        tc.beginPath(); tc.moveTo(s.points[0][0]*w, s.points[0][1]*h);
                        if (s.points.length===2) { tc.lineTo(s.points[1][0]*w, s.points[1][1]*h); }
                        else { for(var p=1;p<s.points.length-1;p++){var px=s.points[p][0]*w,py=s.points[p][1]*h,nx=s.points[p+1][0]*w,ny=s.points[p+1][1]*h; tc.quadraticCurveTo(px,py,(px+nx)/2,(py+ny)/2);} tc.lineTo(s.points[s.points.length-1][0]*w, s.points[s.points.length-1][1]*h); }
                        tc.stroke();
                    } else if (s.tool==='rect') {
                        var rx1=s.x1*w,ry1=s.y1*h,rx2=s.x2*w,ry2=s.y2*h;
                        if(s.filled){var pa=tc.globalAlpha;tc.globalAlpha=s.fillOpacity??0.15;tc.fillStyle=s.color||DRAW_COLOR;tc.fillRect(rx1,ry1,rx2-rx1,ry2-ry1);tc.globalAlpha=pa;}
                        tc.beginPath();tc.rect(rx1,ry1,rx2-rx1,ry2-ry1);tc.stroke();
                    } else if (s.tool==='ellipse') {
                        var ex1=s.x1*w,ey1=s.y1*h,ex2=s.x2*w,ey2=s.y2*h;
                        tc.beginPath();tc.ellipse((ex1+ex2)/2,(ey1+ey2)/2,Math.abs(ex2-ex1)/2,Math.abs(ey2-ey1)/2,0,0,Math.PI*2);
                        if(s.filled){var pa2=tc.globalAlpha;tc.globalAlpha=s.fillOpacity??0.15;tc.fillStyle=s.color||DRAW_COLOR;tc.fill();tc.globalAlpha=pa2;}
                        tc.stroke();
                    } else if (s.tool==='crossout') {
                        var ccx1=s.x1*w,ccy1=s.y1*h,ccx2=s.x2*w,ccy2=s.y2*h,ccw=ccx2-ccx1,cch=ccy2-ccy1,cm=0.05;
                        tc.fillStyle='rgba(0,0,0,0.15)';tc.fillRect(ccx1,ccy1,ccw,cch);
                        tc.lineWidth=1.5;tc.globalAlpha=0.4;tc.setLineDash([6,4]);tc.beginPath();tc.rect(ccx1,ccy1,ccw,cch);tc.stroke();
                        tc.setLineDash([]);tc.globalAlpha=s.opacity??1.0;tc.lineWidth=s.lineWidth||3;
                        tc.beginPath();tc.moveTo(ccx1+ccw*cm,ccy1+cch*cm);tc.lineTo(ccx2-ccw*cm,ccy2-cch*cm);tc.moveTo(ccx2-ccw*cm,ccy1+cch*cm);tc.lineTo(ccx1+ccw*cm,ccy2-cch*cm);tc.stroke();
                    } else if (s.tool==='arrow') { drawArrow(tc, s.x1*w, s.y1*h, s.x2*w, s.y2*h, s.color||DRAW_COLOR, s.lineWidth||3);
                    } else if (s.tool==='callout') { renderCalloutOnCtx(tc, s, w, h); }
                    tc.restore();
                });
                capture.getContext('2d').drawImage(tmp, 0, 0);
            }
            var imgData = capture.toDataURL('image/png');
            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, 0, w, h);
            slideEls[i].querySelectorAll('.info-tip').forEach(function(tip){
                var tc2=tip.querySelector('.tip-content'); if(!tc2) return;
                var rect=tip.getBoundingClientRect();
                pdf.createAnnotation({type:'text',title:'Info',bounds:{x:rect.x,y:rect.y,w:20,h:20},contents:(tc2.innerText||tc2.textContent).trim(),open:false});
            });
        }
        canvas.style.display=''; setSlideIndex(originalSlide);
        pdf.save(opts.pdfFilename || 'presentation.pdf');
    } catch(err) { canvas.style.display=''; alert('Error exportando PDF: '+err.message); setSlideIndex(originalSlide); }
    if (wasDrawMode) setDrawMode(true);
    badge.style.display='none'; badge.style.background='#ff4444';
}

// --- Popup 16:9 ---
function openPresentationPopup() {
    var sH = window.screen.availHeight, popW = Math.round(sH*16/9);
    var left = Math.round((window.screen.availWidth - popW)/2);
    window.open(window.location.href, '_blank', 'width='+popW+',height='+sH+',top=0,left='+left+',menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes');
}


// --- DOM creation and resize ---
function resizeCanvas() { canvas.width=window.innerWidth; canvas.height=window.innerHeight; redrawCanvas(); }

// --- Public API ---
function init(userOpts) {
    opts = userOpts || {};
    STORAGE_KEY = opts.storageKey || ('sa_' + window.location.pathname.replace(/[^a-z0-9]/gi, '_'));
    STORAGE_VERSION = opts.storageVersion || 2;
    if (opts.colors) COLOR_PALETTE = opts.colors;

    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;pointer-events:none;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');

    badge = document.createElement('div');
    badge.style.cssText = 'display:none;position:fixed;top:10px;right:10px;z-index:10000;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;font-family:monospace;letter-spacing:1px;pointer-events:none;';
    document.body.appendChild(badge);

    createColorModal();
    setupMouseHandlers();
    setupKeyboardHandlers();
    window.addEventListener('resize', resizeCanvas);
    loadFromStorage();
    resizeCanvas();
}

function onSlideChanged() { redrawCanvas(); }

function destroy() {
    stopLaser();
    window.removeEventListener('resize', resizeCanvas);
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    if (colorModal && colorModal.parentNode) colorModal.parentNode.removeChild(colorModal);
}

window.SlideAnnotator = { init: init, onSlideChanged: onSlideChanged, redraw: redrawCanvas, destroy: destroy };

})();
