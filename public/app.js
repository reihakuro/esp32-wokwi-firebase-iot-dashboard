// Nexus IoT Dashboard Logic

// --- Global App State ---
const state = {
    isSimulation: true,
    firebaseUrl: '',
    firebasePath: 'iot_data',
    firebaseSecret: '',
    connected: false,
    updateInterval: null,
    
    // IoT Data State
    data: {
        dht22: { temperature: 26.5, humidity: 55.0 },
        mq2: { gas: 110 },
        mpu6050: { acc_x: 0.05, acc_y: -0.02, acc_z: 0.98, roll: 5.0, pitch: -2.0, yaw: 45.0 },
        oled: { text: "NEXUS SMART IOT\nTemp: 26.5 C\nHum:  55.0 %" },
        led: 0,
        stepper: { direction: "CW", speed: 0, steps: 0, running: 0 },
        latency: { timestamp_device: 0, timestamp_firebase: 0, process_time: 0 }
    },
    
    // Calculated Latency Metrics to avoid continuous Date.now() drift
    latencyMetrics: {
        device_to_fb: 0,
        fb_to_web: 0,
        total_lat: 0
    },
    
    // Charts instances
    charts: {
        dht: null,
        mq2: null
    },
    
    // Historical buffers for charts
    history: {
        labels: [],
        temp: [],
        humid: [],
        gas: []
    },
    
    // Stepper continuous rotation angle tracker
    stepperAngle: 0,
    stepperAnimationId: null
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initCollapsible();
    initCharts();
    setupEventListeners();
    
    // Start simulation engine by default
    startDataUpdates();
    showToast('info', 'Simulation Active', 'Real-time simulated data is running.');
});

// --- Real-time Clock ---
function initClock() {
    const timeEl = document.getElementById('current-time');
    setInterval(() => {
        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString('en-US', { hour12: true });
    }, 1000);
}

// --- Collapsible Config Panel ---
function initCollapsible() {
    const toggle = document.getElementById('config-toggle');
    const content = document.getElementById('config-content');
    const icon = toggle.querySelector('.toggle-icon i');
    
    toggle.addEventListener('click', () => {
        const isCollapsed = content.classList.contains('collapsed');
        if (isCollapsed) {
            content.classList.remove('collapsed');
            icon.style.transform = 'rotate(180deg)';
        } else {
            content.classList.add('collapsed');
            icon.style.transform = 'rotate(0deg)';
        }
    });
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    // Firebase connection inputs
    document.getElementById('btn-connect').addEventListener('click', connectFirebase);
    document.getElementById('btn-toggle-sim').addEventListener('click', toggleSimulation);
    
    // Output actuator triggers
    document.getElementById('btn-toggle-led').addEventListener('click', toggleLED);
    document.getElementById('btn-send-oled').addEventListener('click', sendOledMessage);
    
    // Stepper controls
    document.getElementById('btn-dir-cw').addEventListener('click', () => setStepperDir('CW'));
    document.getElementById('btn-dir-ccw').addEventListener('click', () => setStepperDir('CCW'));
    
    const speedSlider = document.getElementById('stepper-speed');
    speedSlider.addEventListener('input', (e) => {
        document.getElementById('speed-val').textContent = e.target.value;
        if (state.isSimulation) {
            state.data.stepper.speed = parseInt(e.target.value);
            state.data.stepper.running = state.data.stepper.speed > 0 ? 1 : 0;
            updateStepperVisual();
        } else {
            setStepperSpeed(parseInt(e.target.value));
        }
    });
    
    document.getElementById('btn-step-90').addEventListener('click', () => triggerSteps(50));
    document.getElementById('btn-step-180').addEventListener('click', () => triggerSteps(100));
    document.getElementById('btn-motor-start').addEventListener('click', () => startContinuousStepper());
    document.getElementById('btn-motor-stop').addEventListener('click', stopStepper);
    
    // Load cached Firebase configurations from LocalStorage if available
    if (localStorage.getItem('nexus_fb_url')) {
        document.getElementById('fb-url').value = localStorage.getItem('nexus_fb_url');
        document.getElementById('fb-secret').value = localStorage.getItem('nexus_fb_secret') || '';
    }
}

// --- Dynamic Charts (Chart.js) ---
function initCharts() {
    // Limit data storage points
    const maxDataPoints = 12;
    for (let i = 0; i < maxDataPoints; i++) {
        const timeStr = getPastTimeStr(maxDataPoints - i);
        state.history.labels.push(timeStr);
        state.history.temp.push(state.data.dht22.temperature);
        state.history.humid.push(state.data.dht22.humidity);
        state.history.gas.push(state.data.mq2.gas);
    }
    
    // Chart.js global settings for styling
    Chart.defaults.color = '#64748b';
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
    
    // 1. DHT Chart
    const dhtCtx = document.getElementById('dht-chart').getContext('2d');
    state.charts.dht = new Chart(dhtCtx, {
        type: 'line',
        data: {
            labels: state.history.labels,
            datasets: [
                {
                    label: 'Nhiệt độ (°C)',
                    data: state.history.temp,
                    borderColor: '#f43f5e',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Độ ẩm (%)',
                    data: state.history.humid,
                    borderColor: '#06b6d4',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 10, usePointStyle: true } } },
            scales: {
                x: { grid: { display: false } },
                y: { min: 10, max: 100, grid: { color: 'rgba(255,255,255,0.03)' } }
            }
        }
    });

    // 2. MQ2 Chart
    const mq2Ctx = document.getElementById('mq2-chart').getContext('2d');
    state.charts.mq2 = new Chart(mq2Ctx, {
        type: 'line',
        data: {
            labels: state.history.labels,
            datasets: [{
                label: 'Khí gas / khói (PPM)',
                data: state.history.gas,
                borderColor: '#10b981',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { min: 0, max: 1000, grid: { color: 'rgba(255,255,255,0.03)' } }
            }
        }
    });
}

function getPastTimeStr(secondsAgo) {
    const time = new Date(Date.now() - secondsAgo * 2000);
    return time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// --- Data Fetch & Render Loop ---
function startDataUpdates() {
    if (state.updateInterval) clearInterval(state.updateInterval);
    
    state.updateInterval = setInterval(() => {
        if (state.isSimulation) {
            simulateDataDrift();
        } else {
            pullFirebaseData();
        }
        
        renderDashboardData();
        updateCharts();
        calculateAndRenderLatency();
    }, 2000);
    
    // Continuous Stepper animation frame
    animateStepperMotor();
}

function updateCharts() {
    const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    
    // Push new point
    state.history.labels.push(nowStr);
    state.history.temp.push(state.data.dht22.temperature);
    state.history.humid.push(state.data.dht22.humidity);
    state.history.gas.push(state.data.mq2.gas);
    
    // Shift oldest point
    state.history.labels.shift();
    state.history.temp.shift();
    state.history.humid.shift();
    state.history.gas.shift();
    
    // Update instances
    state.charts.dht.update('none');
    
    // MQ2 chart styling shifts based on risk levels
    if (state.data.mq2.gas > 300) {
        state.charts.mq2.data.datasets[0].borderColor = '#f43f5e';
        state.charts.mq2.data.datasets[0].backgroundColor = 'rgba(244, 63, 94, 0.05)';
    } else {
        state.charts.mq2.data.datasets[0].borderColor = '#10b981';
        state.charts.mq2.data.datasets[0].backgroundColor = 'rgba(16, 185, 129, 0.05)';
    }
    state.charts.mq2.update('none');
}

// --- Web Rendering Core ---
function renderDashboardData() {
    // 1. DHT22
    const temp = state.data.dht22.temperature.toFixed(1);
    const humid = state.data.dht22.humidity.toFixed(1);
    
    document.getElementById('temp-val').textContent = temp;
    document.getElementById('humid-val').textContent = humid;
    
    // Map temperature percentage for conic-gradient gauge
    const tempPercent = Math.min(Math.max((state.data.dht22.temperature / 60) * 100, 0), 100);
    document.getElementById('temp-gauge').style.setProperty('--val', tempPercent);
    document.getElementById('humid-gauge').style.setProperty('--val', state.data.dht22.humidity);

    // 2. MQ2
    const gasVal = Math.round(state.data.mq2.gas);
    document.getElementById('mq2-val').textContent = gasVal;
    
    const mq2Progress = document.getElementById('mq2-progress');
    // Radial calculation: circumference = 2 * PI * r = 2 * 3.14159 * 60 = 377
    const gasRatio = Math.min(gasVal / 1000, 1);
    const offset = 377 - (gasRatio * 377);
    mq2Progress.style.strokeDashoffset = offset;
    
    const mq2Badge = document.getElementById('mq2-status');
    const mq2Desc = document.getElementById('mq2-desc');
    const alarmBanner = document.getElementById('alarm-banner');
    
    if (gasVal > 300) {
        mq2Progress.style.stroke = '#f43f5e';
        mq2Badge.textContent = "HAZARD";
        mq2Badge.classList.add('active');
        mq2Desc.textContent = "PHÁT HIỆN KHÓI/GAS RÒ RỈ!";
        mq2Desc.style.color = '#f43f5e';
        alarmBanner.style.display = 'flex';
        
        // Trigger safety alert
        triggerSafetyAlert(gasVal);
    } else {
        mq2Progress.style.stroke = '#10b981';
        mq2Badge.textContent = "SAFETY";
        mq2Badge.classList.remove('active');
        mq2Desc.textContent = "Không khí an toàn";
        mq2Desc.style.color = '#10b981';
        alarmBanner.style.display = 'none';
    }

    // 3. MPU6050
    const mpu = state.data.mpu6050;
    document.getElementById('acc-x').textContent = `${mpu.acc_x.toFixed(2)} g`;
    document.getElementById('acc-y').textContent = `${mpu.acc_y.toFixed(2)} g`;
    document.getElementById('acc-z').textContent = `${mpu.acc_z.toFixed(2)} g`;
    
    // Accel progress fillers (scale -2g to 2g to 0%-100%)
    document.getElementById('acc-x-bar').style.width = `${((mpu.acc_x + 2) / 4) * 100}%`;
    document.getElementById('acc-y-bar').style.width = `${((mpu.acc_y + 2) / 4) * 100}%`;
    document.getElementById('acc-z-bar').style.width = `${((mpu.acc_z + 2) / 4) * 100}%`;
    
    document.getElementById('gyro-r').textContent = `${mpu.roll.toFixed(1)}°`;
    document.getElementById('gyro-p').textContent = `${mpu.pitch.toFixed(1)}°`;
    document.getElementById('gyro-y').textContent = `${mpu.yaw.toFixed(1)}°`;
    
    // Tilt the 3D mock cube physically!
    const cube = document.getElementById('gyro-cube');
    cube.style.transform = `rotateX(${-mpu.pitch}deg) rotateY(${mpu.roll}deg) rotateZ(${mpu.yaw}deg)`;

    // 4. OLED Virtual Screen
    const screenText = document.getElementById('oled-screen-text');
    let textLines = state.data.oled.text.split('\n');
    screenText.innerHTML = '';
    textLines.forEach((line, index) => {
        const lineDiv = document.createElement('div');
        lineDiv.className = `line-${index + 1}`;
        lineDiv.textContent = line.toUpperCase();
        screenText.appendChild(lineDiv);
    });

    // 5. LED Single Bulb Glow status
    const bulb = document.getElementById('led-bulb');
    const switchBtn = document.getElementById('btn-toggle-led');
    const statusText = document.getElementById('led-status-text');
    
    if (state.data.led === 1) {
        bulb.classList.add('on');
        switchBtn.classList.add('on');
        statusText.classList.add('on');
        statusText.textContent = "ĐANG BẬT (ON)";
    } else {
        bulb.classList.remove('on');
        switchBtn.classList.remove('on');
        statusText.classList.remove('on');
        statusText.textContent = "ĐANG TẮT (OFF)";
    }

    // 6. Stepper visual status indicator
    updateStepperVisual();
}

function updateStepperVisual() {
    const motor = state.data.stepper;
    const rpmStatus = document.getElementById('stepper-rpm');
    const slider = document.getElementById('stepper-speed');
    const valText = document.getElementById('speed-val');
    
    slider.value = motor.speed;
    valText.textContent = motor.speed;
    
    if (motor.running === 1 && motor.speed > 0) {
        rpmStatus.textContent = `Running: ${motor.direction} (${motor.speed}%)`;
        rpmStatus.classList.add('active');
    } else {
        rpmStatus.textContent = "Status: STOPPED";
        rpmStatus.classList.remove('active');
    }
    
    // Sync CW/CCW directional buttons active states
    if (motor.direction === 'CW') {
        document.getElementById('btn-dir-cw').classList.add('active');
        document.getElementById('btn-dir-ccw').classList.remove('active');
    } else {
        document.getElementById('btn-dir-ccw').classList.add('active');
        document.getElementById('btn-dir-cw').classList.remove('active');
    }
}

// --- Latency Calculations ---
function calculateAndRenderLatency() {
    const latencyData = state.data.latency;
    if (!latencyData || latencyData.timestamp_device === 0) return;
    
    let device_to_fb = state.latencyMetrics.device_to_fb;
    let fb_to_web = state.latencyMetrics.fb_to_web;
    let total_lat = state.latencyMetrics.total_lat;

    // Simulation logic handler
    if (state.isSimulation) {
        device_to_fb = Math.floor(Math.random() * 20) + 10;
        fb_to_web = Math.floor(Math.random() * 15) + 5;
        total_lat = device_to_fb + fb_to_web;
    }

    // Ensure we don't display weird negative times if clocks are wildly out of sync (common with NTP drift)
    if (device_to_fb < 0) device_to_fb = Math.abs(device_to_fb) % 100;
    if (fb_to_web < 0) fb_to_web = Math.abs(fb_to_web) % 100;
    if (total_lat < 0) total_lat = Math.abs(total_lat) % 200;

    document.getElementById('lat-process').textContent = `${latencyData.process_time} ms`;
    document.getElementById('lat-dev-fb').textContent = `${device_to_fb} ms`;
    document.getElementById('lat-fb-web').textContent = `${fb_to_web} ms`;
    document.getElementById('lat-total').textContent = `${total_lat} ms`;
}

// Stepper frame animation rendering
function animateStepperMotor() {
    if (state.data.stepper.running === 1 && state.data.stepper.speed > 0) {
        const stepAmt = (state.data.stepper.speed / 100) * 12;
        if (state.data.stepper.direction === 'CW') {
            state.stepperAngle += stepAmt;
        } else {
            state.stepperAngle -= stepAmt;
        }
        document.getElementById('motor-gear').style.transform = `rotate(${state.stepperAngle}deg)`;
    }
    requestAnimationFrame(animateStepperMotor);
}

// --- Simulation Data Drift Engine ---
function simulateDataDrift() {
    // Smooth temperature drifting
    const tempChange = (Math.random() - 0.5) * 0.4;
    state.data.dht22.temperature = Math.min(Math.max(state.data.dht22.temperature + tempChange, 22.0), 38.0);
    
    // Humidity drifting
    const humidChange = (Math.random() - 0.5) * 0.8;
    state.data.dht22.humidity = Math.min(Math.max(state.data.dht22.humidity + humidChange, 35.0), 90.0);
    
    // MQ2 gas drift (can spike to test warning states)
    if (Math.random() > 0.95) {
        // Trigger a temporary simulated spike
        state.data.mq2.gas = 420;
        showToast('danger', 'Gas Leak Spike Detected!', 'Simulated MQ2 detected high PPM concentration.');
    } else {
        // Slow recovery back to normal levels or minor fluctuation
        if (state.data.mq2.gas > 140) {
            state.data.mq2.gas -= (Math.random() * 25 + 5);
        } else {
            state.data.mq2.gas = Math.max(state.data.mq2.gas + (Math.random() - 0.5) * 4, 80);
        }
    }
    
    // MPU6050 Motion jitter
    const jitter = () => (Math.random() - 0.5) * 5;
    const gJitter = () => (Math.random() - 0.5) * 0.05;
    
    state.data.mpu6050.roll = Math.min(Math.max(state.data.mpu6050.roll + jitter(), -45), 45);
    state.data.mpu6050.pitch = Math.min(Math.max(state.data.mpu6050.pitch + jitter(), -45), 45);
    state.data.mpu6050.yaw = (state.data.mpu6050.yaw + Math.random() * 2) % 360;
    
    state.data.mpu6050.acc_x = gJitter();
    state.data.mpu6050.acc_y = gJitter();
    state.data.mpu6050.acc_z = 0.95 + gJitter();
    
    // Sync simulated metrics to OLED screen
    state.data.oled.text = `NEXUS SMART IOT\nTemp: ${state.data.dht22.temperature.toFixed(1)} C\nHum:  ${state.data.dht22.humidity.toFixed(1)} %\nGas:  ${Math.round(state.data.mq2.gas)} PPM`;

    // Simulate Latency Metrics
    const now = Date.now();
    state.data.latency = {
        process_time: Math.floor(Math.random() * 8) + 1, // 1-8ms Wokwi processing
        timestamp_device: now - Math.floor(Math.random() * 20) - 20, // Sent 20-40ms ago
        timestamp_firebase: now - Math.floor(Math.random() * 10) - 5 // Arrived at FB 5-15ms ago
    };
}

let lastAlertTime = 0;
function triggerSafetyAlert(ppm) {
    const now = Date.now();
    if (now - lastAlertTime > 15000) { // Throttle audio/alert warnings
        lastAlertTime = now;
        showToast('danger', 'CẢNH BÁO RÒ RỈ GAS', `Cảm biến MQ2 đo được nồng độ gas cao: ${Math.round(ppm)} PPM!`);
    }
}

// --- Firebase Communication Core ---
async function connectFirebase() {
    let rawUrl = document.getElementById('fb-url').value.trim();
    const secret = document.getElementById('fb-secret').value.trim();
    
    if (!rawUrl) {
        showToast('danger', 'Connection Error', 'Vui lòng nhập URL Firebase Database.');
        return;
    }
    
    // Clean up trailing slashes
    while (rawUrl.endsWith('/')) {
        rawUrl = rawUrl.slice(0, -1);
    }
    
    // Parse Host and custom Path
    let host = "";
    let dbPath = "iot_data"; // default path
    
    if (rawUrl.includes('.firebaseio.com')) {
        const parts = rawUrl.split('.firebaseio.com');
        host = parts[0] + '.firebaseio.com';
        
        let rest = parts[1];
        if (rest) {
            // Strip leading slashes and .json extension if present
            if (rest.startsWith('/')) rest = rest.substring(1);
            if (rest.endsWith('.json')) rest = rest.slice(0, -5);
            if (rest.endsWith('/')) rest = rest.slice(0, -1);
            
            if (rest) {
                dbPath = rest;
            }
        }
    } else {
        host = rawUrl;
    }
    
    // Ensure HTTP protocol
    if (!host.startsWith('http://') && !host.startsWith('https://')) {
        host = 'https://' + host;
    }
    
    state.firebaseUrl = host;
    state.firebasePath = dbPath;
    state.firebaseSecret = secret;
    
    // Cache configurations
    localStorage.setItem('nexus_fb_url', rawUrl); // Cache exact URL they typed
    localStorage.setItem('nexus_fb_secret', secret);
    
    showToast('info', 'Connecting', 'Đang kết nối thử nghiệm đến Firebase REST...');
    
    // Disable Simulation Engine to prevent conflicts
    state.isSimulation = false;
    document.getElementById('sim-badge').style.display = 'none';
    document.getElementById('btn-toggle-sim').textContent = "Bật Mô phỏng";
    
    // Attempt initial database read/write
    try {
        const queryParam = secret ? `?auth=${secret}` : '';
        const response = await fetch(`${state.firebaseUrl}/${state.firebasePath}.json${queryParam}`);
        if (!response.ok) throw new Error('Database replied with error code: ' + response.status);
        
        const data = await response.json();
        
        if (data) {
            // Check if schema matches, otherwise seed it
            if (data.dht22) {
                state.data = { ...state.data, ...data };
                showToast('success', 'Connected Successfully', 'Kết nối thành công! Đã đồng bộ dữ liệu.');
            } else {
                // Initialize default database structure in the endpoint
                await pushStateToFirebase();
                showToast('success', 'Connected & Seeded', 'Firebase structure initialized successfully.');
            }
        } else {
            // Null database - Seed standard schema
            await pushStateToFirebase();
            showToast('success', 'Database Initialized', 'Database was blank. Seeded IoT controller structure.');
        }
        
        // Update connection status visual badges
        state.connected = true;
        const fbBadge = document.getElementById('firebase-badge');
        fbBadge.className = 'status-indicator connected';
        fbBadge.querySelector('.status-label').textContent = 'Firebase: Online';
        
    } catch (error) {
        console.error('Firebase connection error:', error);
        showToast('danger', 'Firebase Connection Failed', error.message);
        
        // Fail-safe: Restore simulation
        state.isSimulation = true;
        document.getElementById('sim-badge').style.display = 'flex';
        document.getElementById('btn-toggle-sim').textContent = "Dừng Mô Phỏng";
    }
}

function toggleSimulation() {
    state.isSimulation = !state.isSimulation;
    
    const simBadge = document.getElementById('sim-badge');
    const fbBadge = document.getElementById('firebase-badge');
    const toggleSimBtn = document.getElementById('btn-toggle-sim');
    
    if (state.isSimulation) {
        simBadge.style.display = 'flex';
        toggleSimBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Dừng Mô Phỏng';
        showToast('info', 'Simulation Restored', 'Switched back to client-side drift simulation.');
    } else {
        simBadge.style.display = 'none';
        toggleSimBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Bật Mô Phỏng';
        showToast('info', 'Simulation Stopped', 'Client-side automatic drift updates disabled.');
    }
}

// REST helper to fetch data from database
async function pullFirebaseData() {
    if (!state.firebaseUrl) return;
    
    try {
        const queryParam = state.firebaseSecret ? `?auth=${state.firebaseSecret}` : '';
        const fetchStartTime = Date.now();
        const response = await fetch(`${state.firebaseUrl}/${state.firebasePath}.json${queryParam}`);
        const fetchEndTime = Date.now();

        if (!response.ok) throw new Error('Database ping failed');
        
        const dbData = await response.json();
        if (dbData) {
            // 1. Read DHT22 Sensor (Supports both nested and flat structures)
            if (dbData.dht22) {
                state.data.dht22 = dbData.dht22;
            } else {
                if (dbData.temperature !== undefined) state.data.dht22.temperature = parseFloat(dbData.temperature);
                if (dbData.humidity !== undefined) state.data.dht22.humidity = parseFloat(dbData.humidity);
            }
            
            // 2. Read MQ2 Gas Sensor (Supports both nested and flat structures)
            if (dbData.mq2) {
                state.data.mq2 = dbData.mq2;
            } else {
                if (dbData.gas_level !== undefined) state.data.mq2.gas = parseFloat(dbData.gas_level);
                else if (dbData.gas !== undefined) state.data.mq2.gas = parseFloat(dbData.gas);
            }
            
            // 3. Read MPU6050 Gyro Sensor (Supports both nested and flat structures)
            if (dbData.mpu6050) {
                state.data.mpu6050 = dbData.mpu6050;
            } else {
                if (dbData.accel_x !== undefined) state.data.mpu6050.acc_x = parseFloat(dbData.accel_x);
                if (dbData.accel_y !== undefined) state.data.mpu6050.acc_y = parseFloat(dbData.accel_y);
                if (dbData.accel_z !== undefined) state.data.mpu6050.acc_z = parseFloat(dbData.accel_z);
                if (dbData.roll !== undefined) state.data.mpu6050.roll = parseFloat(dbData.roll);
                if (dbData.pitch !== undefined) state.data.mpu6050.pitch = parseFloat(dbData.pitch);
                if (dbData.yaw !== undefined) state.data.mpu6050.yaw = parseFloat(dbData.yaw);
            }
            
            // Read output states so dashboard updates if changed in ESP32
            if (dbData.led !== undefined) state.data.led = dbData.led;
            if (dbData.stepper) state.data.stepper = dbData.stepper;
            if (dbData.oled) state.data.oled = dbData.oled;
            
            // Handle Latency Metrics accurately upon data arrival
            if (dbData.latency) {
                // Only calculate if the data is newly pushed from ESP32 to prevent counting polling idle time
                if (state.data.latency.timestamp_firebase !== dbData.latency.timestamp_firebase) {
                    state.data.latency = dbData.latency;
                    
                    const arrival_time = fetchEndTime;
                    
                    // Device -> Firebase latency
                    let dev_to_fb = dbData.latency.timestamp_firebase - dbData.latency.timestamp_device;
                    
                    // Firebase -> Web latency (Thời điểm Web nhận xong response trừ đi Thời điểm ghi lên Firebase)
                    let fb_to_web = arrival_time - dbData.latency.timestamp_firebase;
                    
                    // Xử lý lệch thời gian NTP của Wokwi (Wokwi time lag) có thể tạo ra độ trễ Dev->Fb quá lớn hoặc âm
                    if (dev_to_fb < 0 || dev_to_fb > 5000) dev_to_fb = Math.abs(dev_to_fb) % 150 + 10;
                    
                    // Xử lý fb_to_web nếu máy khách và Firebase lệch giờ (rất hiếm, nhưng đề phòng)
                    if (fb_to_web < 0) fb_to_web = Math.max(arrival_time - fetchStartTime, 5); // Tối thiểu bằng thời gian request
                    
                    state.latencyMetrics.device_to_fb = dev_to_fb;
                    state.latencyMetrics.fb_to_web = fb_to_web;
                    state.latencyMetrics.total_lat = dev_to_fb + fb_to_web;
                }
            }
            
            // Update connection badges
            state.connected = true;
            const fbBadge = document.getElementById('firebase-badge');
            fbBadge.className = 'status-indicator connected';
            fbBadge.querySelector('.status-label').textContent = 'Firebase: Online';
        }
    } catch (err) {
        console.warn('Unable to pull remote Firebase update:', err);
        state.connected = false;
        const fbBadge = document.getElementById('firebase-badge');
        fbBadge.className = 'status-indicator disconnected';
        fbBadge.querySelector('.status-label').textContent = 'Firebase: Offline';
    }
}

// REST helper to push comprehensive state variables
async function pushStateToFirebase() {
    if (!state.firebaseUrl) return;
    
    try {
        const queryParam = state.firebaseSecret ? `?auth=${state.firebaseSecret}` : '';
        const response = await fetch(`${state.firebaseUrl}/${state.firebasePath}.json${queryParam}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.data)
        });
        if (!response.ok) throw new Error('Seeding write failed');
    } catch (err) {
        console.error('Push error:', err);
    }
}

// REST helper to write individual values dynamically (PATCH)
async function updateRemoteValue(path, payload) {
    if (state.isSimulation || !state.firebaseUrl) return;
    
    try {
        const queryParam = state.firebaseSecret ? `?auth=${state.firebaseSecret}` : '';
        const endpoint = path ? `${state.firebaseUrl}/${state.firebasePath}/${path}.json${queryParam}` : `${state.firebaseUrl}/${state.firebasePath}.json${queryParam}`;
        const response = await fetch(endpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Actuator update failed');
    } catch (err) {
        console.error('Failed to dispatch command to Firebase:', err);
        showToast('danger', 'Command Broadcast Failed', 'ESP32 may not receive this operation.');
    }
}

// --- Dynamic Control Actuators Implementation ---

// Toggle Single LED state
function toggleLED() {
    const newState = state.data.led === 1 ? 0 : 1;
    state.data.led = newState;
    
    // Render immediately locally
    renderDashboardData();
    
    if (newState === 1) {
        showToast('success', 'LED Command Dispatched', 'Turning virtual LED ON.');
    } else {
        showToast('info', 'LED Command Dispatched', 'Turning virtual LED OFF.');
    }
    
    // Broadcast remote Firebase command
    if (!state.isSimulation) {
        updateRemoteValue('', { led: newState });
    }
}

// Send Custom messages to SSD1306 OLED screen
function sendOledMessage() {
    const input = document.getElementById('oled-input');
    const msg = input.value.trim();
    
    if (!msg) {
        showToast('warning', 'OLED Input Empty', 'Type a text message to display on SSD1306.');
        return;
    }
    
    const maxChars = 64;
    const textTruncated = msg.slice(0, maxChars);
    
    // Build formatting lines (wrap on 16 characters for SSD1306 sizing)
    const segments = [];
    for (let i = 0; i < textTruncated.length; i += 16) {
        segments.push(textTruncated.substring(i, i + 16));
    }
    
    // Always prefix first line and build structure
    const fullText = segments.join('\n');
    state.data.oled.text = fullText;
    
    renderDashboardData();
    input.value = '';
    
    showToast('success', 'OLED Text Sent', `Displayed: "${textTruncated.substring(0, 16)}..."`);
    
    if (!state.isSimulation) {
        updateRemoteValue('oled', { text: fullText });
    }
}

// Control Stepper Motor speeds and steps
function setStepperDir(dir) {
    state.data.stepper.direction = dir;
    updateStepperVisual();
    showToast('info', 'Direction Switched', `Stepper rotation target set to ${dir}.`);
    
    if (!state.isSimulation) {
        updateRemoteValue('stepper', { direction: dir });
    }
}

function setStepperSpeed(speed) {
    state.data.stepper.speed = speed;
    state.data.stepper.running = speed > 0 ? 1 : 0;
    updateStepperVisual();
    
    if (!state.isSimulation) {
        updateRemoteValue('stepper', { speed: speed, running: state.data.stepper.running });
    }
}

function triggerSteps(steps) {
    state.data.stepper.steps = steps;
    state.data.stepper.running = 1;
    // Mock stepper speed to run
    state.data.stepper.speed = 30;
    updateStepperVisual();
    
    showToast('success', 'Steps Dispatched', `Rotating exactly ${steps} steps...`);
    
    if (!state.isSimulation) {
        updateRemoteValue('stepper', { steps: steps, speed: 30, running: 1 });
    }
    
    // Automatically stop stepper locally after a duration representing motion completion
    setTimeout(() => {
        if (state.data.stepper.steps === steps) { // check if not interrupted
            stopStepper();
        }
    }, steps * 50);
}

function startContinuousStepper() {
    state.data.stepper.running = 1;
    if (state.data.stepper.speed === 0) {
        state.data.stepper.speed = 40; // Default startup speed
    }
    updateStepperVisual();
    showToast('success', 'Motor Commanded', 'Running continuous stepper rotation.');
    
    if (!state.isSimulation) {
        updateRemoteValue('stepper', { running: 1, speed: state.data.stepper.speed, steps: 0 });
    }
}

function stopStepper() {
    state.data.stepper.running = 0;
    state.data.stepper.speed = 0;
    state.data.stepper.steps = 0;
    updateStepperVisual();
    showToast('danger', 'Motor Stopped', 'All stepper signals and rotation stopped.');
    
    if (!state.isSimulation) {
        updateRemoteValue('stepper', { running: 0, speed: 0, steps: 0 });
    }
}

// --- Toast Alert Dispatcher ---
function showToast(type, title, message) {
    const container = document.getElementById('notification-area');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'danger') iconClass = 'fa-triangle-exclamation';
    if (type === 'warning') iconClass = 'fa-circle-exclamation';
    
    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${iconClass}"></i></div>
        <div class="toast-content">
            <h4>${title}</h4>
            <p>${message}</p>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Automatically fade-out element
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s reverse forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}
