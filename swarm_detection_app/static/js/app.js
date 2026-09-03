document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const uploadZone = document.getElementById('uploadZone');
    const imageInput = document.getElementById('imageInput');
    const selectBtn = document.getElementById('selectBtn');
    const previewContainer = document.getElementById('previewContainer');
    const previewImage = document.getElementById('previewImage');
    const fileInfo = document.getElementById('fileInfo');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loadingState = document.getElementById('loadingState');
    const dashboardResult = document.getElementById('dashboardResult');
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');
    
    // Sliders & Controls
    const thresholdSlider = document.getElementById('thresholdSlider');
    const thresholdValBadge = document.getElementById('thresholdValBadge');
    const confSlider = document.getElementById('confSlider');
    const confValBadge = document.getElementById('confValBadge');
    const recalculateBtn = document.getElementById('recalculateBtn');

    // System Status elements
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const ollamaStatusText = document.getElementById('ollamaStatusText');
    const ollamaDot = document.getElementById('ollamaDot');
    const systemGpu = document.getElementById('systemGpu');
    const systemDevice = document.getElementById('systemDevice');
    const systemLlm = document.getElementById('systemLlm');

    // AI Report Elements
    const aiReportContent = document.getElementById('aiReportContent');
    const copyAiReportBtn = document.getElementById('copyAiReportBtn');

    // Chart instances
    let confidenceChartInstance = null;
    let sizeChartInstance = null;

    // State Variables
    let selectedFile = null;
    let activeResultData = null;
    let rawLlmMarkdown = "";

    // 1. Initial Health Check & System Status Load
    fetch('/api/health')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'Ready') {
                statusDot.className = 'status-dot online';
                statusText.textContent = 'GPU Online';
                systemGpu.textContent = data.gpu_name !== 'N/A' ? data.gpu_name : 'CPU Only';
                systemDevice.textContent = data.device;
            } else {
                statusDot.className = 'status-dot offline';
                statusText.textContent = 'Model Offline';
            }

            // Check Ollama status
            const ollama = data.ollama || {};
            if (ollama.reachable) {
                ollamaDot.className = 'status-dot online';
                ollamaStatusText.textContent = 'LLaMA-3 Online';
                systemLlm.textContent = ollama.model || 'llama3:latest';
            } else {
                ollamaDot.className = 'status-dot offline';
                ollamaStatusText.textContent = 'LLaMA-3 Standby';
                systemLlm.textContent = `${ollama.model || 'llama3'} (offline)`;
            }
        })
        .catch(err => {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'API Offline';
            ollamaDot.className = 'status-dot offline';
            console.error("Health check request failed:", err);
        });

    // 2. Control Sliders Interaction
    thresholdSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        thresholdValBadge.textContent = `${val} UAVs`;
        if (activeResultData) {
            recalculateBtn.classList.remove('d-none');
        }
    });

    confSlider.addEventListener('input', (e) => {
        const val = Math.round(parseFloat(e.target.value) * 100);
        confValBadge.textContent = `${val}%`;
        if (activeResultData) {
            recalculateBtn.classList.remove('d-none');
        }
    });

    // Dynamic Recalculation Button
    recalculateBtn.addEventListener('click', () => {
        if (!activeResultData) return;

        const swarmThreshold = parseInt(thresholdSlider.value);
        const confThreshold = parseFloat(confSlider.value);

        recalculateBtn.setAttribute('disabled', 'true');
        recalculateBtn.innerHTML = '⏳ Recalculating...';

        fetch('/api/recalculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                detections: activeResultData.raw_all_detections || activeResultData.detections,
                dimensions: activeResultData.metadata.dimensions,
                filename: activeResultData.metadata.filename,
                swarm_threshold: swarmThreshold,
                conf_threshold: confThreshold
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                // Update in-memory data
                activeResultData.analytics = data.analytics;
                activeResultData.detections = data.detections;
                activeResultData.llm_summary = data.llm_summary;
                activeResultData.metadata.swarm_threshold = swarmThreshold;
                activeResultData.metadata.conf_threshold = confThreshold;
                
                // Repopulate UI
                populateDashboard(activeResultData);
            }
        })
        .catch(err => console.error("Recalculation error:", err))
        .finally(() => {
            recalculateBtn.removeAttribute('disabled');
            recalculateBtn.innerHTML = '⚡ Apply to Active Scene';
        });
    });

    // 3. Drag and Drop Handlers
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.remove('dragover');
        }, false);
    });

    uploadZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileSelection(files[0]);
        }
    });

    selectBtn.addEventListener('click', () => {
        imageInput.click();
    });

    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });

    // 4. Process File Selection and Load Preview
    function handleFileSelection(file) {
        errorAlert.classList.add('d-none');
        const ext = file.name.split('.').pop().toLowerCase();
        const allowed = ['jpg', 'jpeg', 'png', 'webp'];
        
        if (!allowed.includes(ext)) {
            showError("Unsupported file format. Please upload a JPG, JPEG, PNG, or WEBP image.");
            resetUploadUI();
            return;
        }

        selectedFile = file;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;
            
            const img = new Image();
            img.onload = function() {
                fileInfo.innerHTML = `
                    <strong>Filename:</strong> ${file.name} <br>
                    <strong>Size:</strong> ${sizeMb} MB <br>
                    <strong>Resolution:</strong> ${img.width} × ${img.height} px
                `;
                previewContainer.classList.remove('d-none');
                document.getElementById('placeholderInfo').classList.add('d-none');
                analyzeBtn.removeAttribute('disabled');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function resetUploadUI() {
        selectedFile = null;
        previewContainer.classList.add('d-none');
        document.getElementById('placeholderInfo').classList.remove('d-none');
        previewImage.src = '';
        fileInfo.innerHTML = '';
        analyzeBtn.setAttribute('disabled', 'true');
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorAlert.classList.remove('d-none');
        window.scrollTo({ top: errorAlert.offsetTop - 20, behavior: 'smooth' });
    }

    // 5. Analyze Button Form Submission
    analyzeBtn.addEventListener('click', () => {
        if (!selectedFile) return;

        // Display loading state
        loadingState.classList.remove('d-none');
        dashboardResult.classList.add('d-none');
        errorAlert.classList.add('d-none');
        analyzeBtn.setAttribute('disabled', 'true');
        selectBtn.setAttribute('disabled', 'true');
        imageInput.setAttribute('disabled', 'true');

        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('swarm_threshold', thresholdSlider.value);
        formData.append('conf_threshold', confSlider.value);

        fetch('/api/detect', {
            method: 'POST',
            body: formData
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(errData => {
                    throw new Error(errData.error || errData.detail || "Server error occurred during processing.");
                });
            }
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                // Store raw detections for instant recalculation
                data.raw_all_detections = JSON.parse(JSON.stringify(data.detections));
                activeResultData = data;
                populateDashboard(data);
                recalculateBtn.classList.remove('d-none');
            } else {
                throw new Error("Invalid backend response status.");
            }
        })
        .catch(err => {
            showError(err.message || "An unexpected error occurred while analyzing the image.");
        })
        .finally(() => {
            loadingState.classList.add('d-none');
            analyzeBtn.removeAttribute('disabled');
            selectBtn.removeAttribute('disabled');
            imageInput.removeAttribute('disabled');
        });
    });

    // 6. Populate and Display the Dashboard
    function populateDashboard(data) {
        const analytics = data.analytics;
        const meta = data.metadata;
        
        // Show container
        dashboardResult.classList.remove('d-none');
        
        // Render images
        document.getElementById('annotatedImg').src = data.annotated_image_url;
        document.getElementById('downloadLink').href = data.annotated_image_url;
        document.getElementById('imgLabelCount').textContent = `Detected: ${analytics.drone_count} UAV${analytics.drone_count !== 1 ? 's' : ''}`;
        
        // 4 Main metrics cards
        document.getElementById('metricDroneCount').textContent = analytics.drone_count;
        document.getElementById('metricAvgConfidence').textContent = `${analytics.average_confidence}%`;
        document.getElementById('metricSwarmDensity').textContent = analytics.density;
        
        // Alert Level Badge rendering
        const alertBadge = document.getElementById('metricAlertBadge');
        alertBadge.textContent = analytics.alert;
        alertBadge.className = 'alert-badge';
        if (analytics.alert === 'NONE') {
            alertBadge.classList.add('none');
        } else if (analytics.alert === 'NORMAL') {
            alertBadge.classList.add('normal');
        } else {
            alertBadge.classList.add('swarm-alert');
        }
        
        // Configured threshold subtitle
        document.getElementById('alertThresholdDetails').innerHTML = `
            ${analytics.drone_count} detected UAVs <br> Alert threshold: ${analytics.threshold}
        `;

        // Secondary metrics list
        document.getElementById('statMinConf').textContent = `${analytics.min_confidence}%`;
        document.getElementById('statMaxConf').textContent = `${analytics.max_confidence}%`;
        document.getElementById('statFootprint').textContent = `${analytics.detection_footprint}%`;
        document.getElementById('statAvgBboxSize').textContent = `${analytics.bbox_avg_width} × ${analytics.bbox_avg_height} px`;
        document.getElementById('statSpatialSpread').textContent = `${analytics.spread_width} × ${analytics.spread_height} px`;
        document.getElementById('statNnd').textContent = analytics.drone_count > 1 ? `${analytics.nearest_neighbor_distance} px` : 'N/A';
        
        // Density indicator scale toggling
        const steps = ['sparseStep', 'moderateStep', 'denseStep', 'veryDenseStep', 'highlyDenseStep'];
        steps.forEach(stepId => {
            document.getElementById(stepId).classList.remove('active');
        });
        
        if (analytics.density === 'Sparse') {
            document.getElementById('sparseStep').classList.add('active');
        } else if (analytics.density === 'Moderate') {
            document.getElementById('moderateStep').classList.add('active');
        } else if (analytics.density === 'Dense') {
            document.getElementById('denseStep').classList.add('active');
        } else if (analytics.density === 'Very Dense') {
            document.getElementById('veryDenseStep').classList.add('active');
        } else if (analytics.density === 'Highly Dense') {
            document.getElementById('highlyDenseStep').classList.add('active');
        }

        // Render AI Tactical Briefing (LLaMA 3 Markdown)
        rawLlmMarkdown = data.llm_summary || analytics.scene_analysis;
        if (typeof marked !== 'undefined') {
            aiReportContent.innerHTML = marked.parse(rawLlmMarkdown);
        } else {
            aiReportContent.innerText = rawLlmMarkdown;
        }

        // Render Interactive Detection Charts
        renderConfidenceCurveChart(data.detections, analytics.average_confidence);
        renderSizeDistributionChart(data.detections);

        // Canvas Drawing
        drawSpatialDistribution(data.detections, meta.dimensions, analytics);

        // Rule-based summary fallback text
        document.getElementById('sceneSummaryText').textContent = analytics.scene_analysis;

        // Detections Table
        const tableBody = document.getElementById('detectionsTableBody');
        tableBody.innerHTML = '';
        if (data.detections.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No UAVs detected with current confidence filter.</td></tr>`;
        } else {
            data.detections.forEach((det, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>#${idx + 1}</strong></td>
                    <td><span class="badge bg-light text-dark border">${(det.confidence * 100).toFixed(1)}%</span></td>
                    <td>${Math.round(det.center_x)} px</td>
                    <td>${Math.round(det.center_y)} px</td>
                    <td>${Math.round(det.width)} px</td>
                    <td>${Math.round(det.height)} px</td>
                `;
                tableBody.appendChild(tr);
            });
        }

        // Image Information Card
        document.getElementById('metaFilename').textContent = meta.filename;
        document.getElementById('metaDimensions').textContent = `${meta.dimensions} px`;
        document.getElementById('metaInference').textContent = `${meta.inference_resolution} px`;
        document.getElementById('metaModel').textContent = meta.model;
        
        // Smooth scroll to results on fresh inference
        if (!data.is_recalculation) {
            setTimeout(() => {
                window.scrollTo({
                    top: dashboardResult.offsetTop - 20,
                    behavior: 'smooth'
                });
            }, 150);
        }
    }

    // 7. Copy AI Report to Clipboard
    copyAiReportBtn.addEventListener('click', () => {
        if (!rawLlmMarkdown) return;
        navigator.clipboard.writeText(rawLlmMarkdown).then(() => {
            const origText = copyAiReportBtn.innerHTML;
            copyAiReportBtn.innerHTML = '✅ Copied!';
            setTimeout(() => {
                copyAiReportBtn.innerHTML = origText;
            }, 2000);
        });
    });

    // 8. Render Detection Confidence Curve (Chart.js)
    function renderConfidenceCurveChart(detections, avgConfidence) {
        const ctx = document.getElementById('confidenceChart').getContext('2d');
        
        if (confidenceChartInstance) {
            confidenceChartInstance.destroy();
        }

        const labels = detections.map((_, idx) => `#${idx + 1}`);
        const confValues = detections.map(d => parseFloat((d.confidence * 100).toFixed(1)));
        const avgArray = Array(labels.length).fill(avgConfidence);

        confidenceChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.length > 0 ? labels : ['No Target'],
                datasets: [
                    {
                        label: 'UAV Confidence (%)',
                        data: confValues.length > 0 ? confValues : [0],
                        borderColor: '#0284c7',
                        backgroundColor: 'rgba(2, 132, 199, 0.12)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: '#0284c7',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Mean Confidence',
                        data: avgArray.length > 0 ? avgArray : [0],
                        borderColor: '#10b981',
                        borderWidth: 1.5,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${context.raw}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        min: 0,
                        max: 100,
                        ticks: { callback: v => v + '%' },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        grid: { color: '#f8fafc' }
                    }
                }
            }
        });
    }

    // 9. Render Target Size Breakdown Chart (Chart.js)
    function renderSizeDistributionChart(detections) {
        const ctx = document.getElementById('sizeChart').getContext('2d');
        
        if (sizeChartInstance) {
            sizeChartInstance.destroy();
        }

        let smallCount = 0;   // < 600 px^2
        let mediumCount = 0;  // 600 - 1500 px^2
        let largeCount = 0;   // > 1500 px^2

        detections.forEach(d => {
            const area = d.width * d.height;
            if (area < 600) smallCount++;
            else if (area <= 1500) mediumCount++;
            else largeCount++;
        });

        sizeChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Small (<600 px²)', 'Medium (600-1500 px²)', 'Large (>1500 px²)'],
                datasets: [{
                    label: 'Target Count',
                    data: [smallCount, mediumCount, largeCount],
                    backgroundColor: [
                        'rgba(13, 148, 136, 0.75)',
                        'rgba(2, 132, 199, 0.75)',
                        'rgba(124, 58, 237, 0.75)'
                    ],
                    borderColor: [
                        '#0d9488',
                        '#0284c7',
                        '#7c3aed'
                    ],
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // 10. Draw normalized coordinate radar map on HTML5 Canvas
    function drawSpatialDistribution(detections, dimensionsStr, analytics) {
        const canvas = document.getElementById('spatialCanvas');
        const ctx = canvas.getContext('2d');
        
        const dims = dimensionsStr.split('×').map(d => parseInt(d.trim()));
        const origW = dims[0] || 1280;
        const origH = dims[1] || 720;
        
        const pad = 18;
        const cw = canvas.width;
        const ch = canvas.height;
        
        ctx.clearRect(0, 0, cw, ch);
        
        // Radar circular range rings
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        const centerX = cw / 2;
        const centerY = ch / 2;
        [40, 80, 120].forEach(radius => {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.stroke();
        });

        // Grid lines
        const gridX = cw / 4;
        const gridY = ch / 4;
        for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(i * gridX, 0);
            ctx.lineTo(i * gridX, ch);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, i * gridY);
            ctx.lineTo(cw, i * gridY);
            ctx.stroke();
        }
        
        if (detections.length === 0) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No detections in active threshold', cw / 2, ch / 2);
            return;
        }

        // Draw Swarm Region Boundary
        let minNx = 1, maxNx = 0, minNy = 1, maxNy = 0;
        detections.forEach(det => {
            const nx = det.center_x / origW;
            const ny = det.center_y / origH;
            minNx = Math.min(minNx, nx);
            maxNx = Math.max(maxNx, nx);
            minNy = Math.min(minNy, ny);
            maxNy = Math.max(maxNy, ny);
        });
        
        const px1 = minNx * (cw - 2 * pad) + pad;
        const py1 = minNy * (ch - 2 * pad) + pad;
        const px2 = maxNx * (cw - 2 * pad) + pad;
        const py2 = maxNy * (ch - 2 * pad) + pad;
        
        if (detections.length > 1) {
            ctx.strokeStyle = 'rgba(13, 148, 136, 0.35)';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(px1, py1, px2 - px1, py2 - py1);
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(13, 148, 136, 0.04)';
            ctx.fillRect(px1, py1, px2 - px1, py2 - py1);
        }

        // Draw Target Pins
        detections.forEach((det, idx) => {
            const nx = det.center_x / origW;
            const ny = det.center_y / origH;
            const x = nx * (cw - 2 * pad) + pad;
            const y = ny * (ch - 2 * pad) + pad;
            
            ctx.fillStyle = '#0284c7';
            ctx.beginPath();
            ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(2, 132, 199, 0.5)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(x, y, 9, 0, 2 * Math.PI);
            ctx.stroke();
            
            ctx.fillStyle = '#475569';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`#${idx + 1}`, x + 11, y + 3);
        });

        // Draw Swarm Centroid Crosshair
        const ncx = (analytics.centroid_x / origW) * (cw - 2 * pad) + pad;
        const ncy = (analytics.centroid_y / origH) * (ch - 2 * pad) + pad;
        
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.8;
        
        ctx.beginPath();
        ctx.moveTo(ncx - 12, ncy);
        ctx.lineTo(ncx + 12, ncy);
        ctx.moveTo(ncx, ncy - 12);
        ctx.lineTo(ncx, ncy + 12);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(ncx, ncy, 5, 0, 2 * Math.PI);
        ctx.stroke();
        
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText('Swarm Centroid', ncx + 10, ncy - 8);
    }
});
