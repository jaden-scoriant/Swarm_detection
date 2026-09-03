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
    
    // Threat Elements
    const threatBanner = document.getElementById('threatBanner');
    const threatBannerBadge = document.getElementById('threatBannerBadge');

    // PDF Export Button
    const exportPdfBtn = document.getElementById('exportPdfBtn');

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

        // Manage Reddish Threat Active State
        if (analytics.alert === 'SWARM ALERT') {
            document.body.classList.add('threat-active');
            threatBanner.classList.remove('d-none');
            threatBannerBadge.textContent = `${analytics.density.toUpperCase()} • ${analytics.drone_count} UAVs`;
        } else {
            document.body.classList.remove('threat-active');
            threatBanner.classList.add('d-none');
        }
        
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
        alertBadge.className = 'alert-badge font-mono';
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
        renderConfidenceCurveChart(data.detections, analytics.average_confidence, analytics.alert === 'SWARM ALERT');
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
                    <td><span class="badge ${det.confidence >= 0.75 ? 'bg-success' : 'bg-light text-dark border'} font-mono">${(det.confidence * 100).toFixed(1)}%</span></td>
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

    // 8. Export Full Intelligence Report as PDF
    exportPdfBtn.addEventListener('click', () => {
        if (!activeResultData) return;

        exportPdfBtn.setAttribute('disabled', 'true');
        exportPdfBtn.innerHTML = '⏳ Generating PDF...';

        const analytics = activeResultData.analytics;
        const meta = activeResultData.metadata;
        const isThreat = analytics.alert === 'SWARM ALERT';

        // Extract static chart & radar canvas images
        const confidenceImgData = confidenceChartInstance ? confidenceChartInstance.toBase64Image() : '';
        const sizeImgData = sizeChartInstance ? sizeChartInstance.toBase64Image() : '';
        const radarCanvas = document.getElementById('spatialCanvas');
        const radarImgData = radarCanvas ? radarCanvas.toDataURL('image/png') : '';
        const annotatedImgSrc = document.getElementById('annotatedImg').src;

        // Build standalone, printable PDF HTML container
        const reportDiv = document.createElement('div');
        reportDiv.style.padding = '24px';
        reportDiv.style.fontFamily = "'Inter', sans-serif";
        reportDiv.style.backgroundColor = '#ffffff';
        reportDiv.style.color = '#0f172a';
        // html2canvas only captures painted, in-document content reliably.
        // Show this temporary export surface while the PDF is being rendered;
        // it is removed as soon as the browser download begins.
        reportDiv.style.position = 'absolute';
        reportDiv.style.left = '0';
        reportDiv.style.top = '0';
        reportDiv.style.zIndex = '2147483647';
        reportDiv.style.minHeight = '100vh';
        reportDiv.style.width = '794px';
        reportDiv.style.boxSizing = 'border-box';

        const headerColor = isThreat ? '#991b1b' : '#0284c7';
        const threatTag = isThreat ? `
            <div style="background: linear-gradient(135deg, #7f1d1d, #b91c1c); color: #fff; padding: 12px 18px; border-radius: 8px; margin-bottom: 18px;">
                <h2 style="margin: 0; font-size: 15px; font-weight: bold;">🚨 CRITICAL SWARM THREAT DETECTED (ALERT ACTIVE)</h2>
                <p style="margin: 3px 0 0 0; font-size: 12px; color: #fecaca;">Target count exceeds threshold (${analytics.threshold} UAVs). Tactical formation active.</p>
            </div>
        ` : `
            <div style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 10px 16px; border-radius: 8px; margin-bottom: 18px;">
                <strong style="font-size: 13px;">🟢 NORMAL OPERATIONAL STATE</strong> - Swarm count within safe monitoring thresholds.
            </div>
        `;

        reportDiv.innerHTML = `
            <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h1 style="font-size: 20px; font-weight: 800; margin: 0; color: ${headerColor};">UAV SWARM INTELLIGENCE REPORT</h1>
                        <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">Automated Computer Vision & Neural LLaMA 3 Analysis</p>
                    </div>
                    <div style="text-align: right; font-size: 11px; color: #64748b; font-family: monospace;">
                        Date: ${new Date().toLocaleString()}<br>
                        Source: ${meta.filename} (${meta.dimensions})
                    </div>
                </div>
            </div>

            ${threatTag}

            <!-- Annotated Image & Primary Metrics -->
            <div style="display: flex; gap: 16px; margin-bottom: 20px;">
                <div style="flex: 1.2; text-align: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #fafafa;">
                    <img src="${annotatedImgSrc}" style="max-width: 100%; max-height: 260px; object-fit: contain; border-radius: 4px;">
                    <p style="font-size: 10px; color: #64748b; margin: 4px 0 0 0;">Annotated YOLO26s Detections (1280px inference)</p>
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px;">
                            <span style="font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase;">Drone Count</span>
                            <div style="font-size: 22px; font-weight: 800; color: ${isThreat ? '#991b1b' : '#0f172a'}; font-family: monospace;">${analytics.drone_count}</div>
                        </div>
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px;">
                            <span style="font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase;">Avg Confidence</span>
                            <div style="font-size: 22px; font-weight: 800; color: #0f172a; font-family: monospace;">${analytics.average_confidence}%</div>
                        </div>
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px;">
                            <span style="font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase;">Swarm Density</span>
                            <div style="font-size: 16px; font-weight: 800; color: #0d9488; font-family: monospace; margin-top: 4px;">${analytics.density}</div>
                        </div>
                        <div style="background: ${isThreat ? '#fee2e2' : '#f8fafc'}; border: 1px solid ${isThreat ? '#f87171' : '#e2e8f0'}; border-radius: 6px; padding: 10px;">
                            <span style="font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase;">Alert Level</span>
                            <div style="font-size: 14px; font-weight: 800; color: ${isThreat ? '#991b1b' : '#166534'}; font-family: monospace; margin-top: 4px;">${analytics.alert}</div>
                        </div>
                    </div>
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; font-size: 10px; color: #475569;">
                        <strong>Telemetry:</strong> Footprint: ${analytics.detection_footprint}% | NND: ${analytics.nearest_neighbor_distance} px | Spread: ${analytics.spread_width}×${analytics.spread_height} px
                    </div>
                </div>
            </div>

            <!-- AI LLaMA 3 Briefing -->
            <div style="border-left: 4px solid ${isThreat ? '#dc2626' : '#7c3aed'}; background: #fbfcfe; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 20px;">
                <div style="font-size: 11px; font-weight: bold; color: ${isThreat ? '#991b1b' : '#7c3aed'}; margin-bottom: 8px;">AI TACTICAL BRIEFING (LLaMA 3 Neural Inference)</div>
                <div style="font-size: 11px; line-height: 1.5; color: #334155;">
                    ${marked.parse(rawLlmMarkdown)}
                </div>
            </div>

            <!-- Complete deterministic analysis and advanced telemetry -->
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 20px; page-break-inside: avoid;">
                <div style="font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 8px;">COMPLETE ANALYSIS &amp; TELEMETRY</div>
                <p style="font-size: 11px; line-height: 1.5; color: #334155; margin: 0 0 10px 0;">${analytics.scene_analysis}</p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10px; color: #334155;">
                    <div><strong>Minimum confidence:</strong> ${analytics.min_confidence}%</div>
                    <div><strong>Maximum confidence:</strong> ${analytics.max_confidence}%</div>
                    <div><strong>Average bounding box:</strong> ${analytics.bbox_avg_width} x ${analytics.bbox_avg_height} px</div>
                    <div><strong>Bounding-box area range:</strong> ${analytics.bbox_smallest_area} - ${analytics.bbox_largest_area} px²</div>
                    <div><strong>Swarm centroid:</strong> ${analytics.centroid_x}, ${analytics.centroid_y} px</div>
                    <div><strong>Coordinate deviation:</strong> X ${analytics.std_dev_x} px, Y ${analytics.std_dev_y} px</div>
                    <div><strong>Source resolution:</strong> ${meta.dimensions} px</div>
                    <div><strong>Configured alert threshold:</strong> ${analytics.threshold} UAVs</div>
                </div>
            </div>

            <!-- Visual Charts & Radar Canvas -->
            <div style="page-break-inside: avoid; margin-bottom: 20px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                    <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center; background: #fafafa;">
                        <span style="font-size: 9px; font-weight: bold; color: #64748b;">SPATIAL COORDINATE RADAR</span>
                        <img src="${radarImgData}" style="max-width: 100%; height: 130px; object-fit: contain; margin-top: 4px;">
                    </div>
                    <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center; background: #fafafa;">
                        <span style="font-size: 9px; font-weight: bold; color: #64748b;">CONFIDENCE SPECTRUM CURVE</span>
                        <img src="${confidenceImgData}" style="max-width: 100%; height: 130px; object-fit: contain; margin-top: 4px;">
                    </div>
                    <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center; background: #fafafa;">
                        <span style="font-size: 9px; font-weight: bold; color: #64748b;">TARGET SIZE BREAKDOWN</span>
                        <img src="${sizeImgData}" style="max-width: 100%; height: 130px; object-fit: contain; margin-top: 4px;">
                    </div>
                </div>
            </div>

            <!-- Target Detection Details Table -->
            <div>
                <div style="font-size: 10px; font-weight: bold; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">Detected Targets Summary</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 10px; font-family: monospace;">
                    <thead>
                        <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                            <th style="padding: 4px 6px;">#</th>
                            <th style="padding: 4px 6px;">Confidence</th>
                            <th style="padding: 4px 6px;">Center X</th>
                            <th style="padding: 4px 6px;">Center Y</th>
                            <th style="padding: 4px 6px;">Width</th>
                            <th style="padding: 4px 6px;">Height</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activeResultData.detections.map((d, i) => `
                            <tr style="border-bottom: 1px solid #f1f5f9; page-break-inside: avoid; break-inside: avoid;">
                                <td style="padding: 4px 6px; font-weight: bold;">#${i + 1}</td>
                                <td style="padding: 4px 6px;">${(d.confidence * 100).toFixed(1)}%</td>
                                <td style="padding: 4px 6px;">${Math.round(d.center_x)} px</td>
                                <td style="padding: 4px 6px;">${Math.round(d.center_y)} px</td>
                                <td style="padding: 4px 6px;">${Math.round(d.width)} px</td>
                                <td style="padding: 4px 6px;">${Math.round(d.height)} px</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        const filename = `UAV_Swarm_Intelligence_Report_${new Date().toISOString().slice(0,19).replace(/[:T]/g, '_')}.pdf`;
        
        const opt = {
            margin: [8, 8, 8, 8],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            // Let html2pdf divide long briefing and target-table content across
            // pages.  Do not mark the entire table as unbreakable: that can
            // push it beyond the final page and make rows appear missing.
            pagebreak: { mode: ['css', 'legacy'], avoid: ['img', 'tr'] },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Write directly with jsPDF instead of screenshotting HTML with
        // html2canvas. The screenshot path can generate a blank page when the
        // dashboard contains canvases, scrolling panels, or page-break rules.
        const JsPdf = window.jspdf && window.jspdf.jsPDF;
        if (JsPdf) {
            try {
                const pdf = new JsPdf({ unit: 'mm', format: 'a4', orientation: 'portrait' });
                const margin = 12;
                const pageWidth = 210;
                const pageHeight = 297;
                const contentWidth = pageWidth - (margin * 2);
                let y = margin;
                const cleanText = (value) => String(value ?? '')
                    .replace(/[\u2013\u2014]/g, '-')
                    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
                const nextPage = () => {
                    pdf.addPage();
                    y = margin;
                };
                const ensureSpace = (height) => {
                    if (y + height > pageHeight - margin) nextPage();
                };
                const addHeading = (text) => {
                    ensureSpace(9);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(13);
                    pdf.setTextColor(15, 23, 42);
                    pdf.text(cleanText(text), margin, y);
                    y += 7;
                };
                const addParagraph = (text, size = 9) => {
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(size);
                    pdf.setTextColor(51, 65, 85);
                    const lines = pdf.splitTextToSize(cleanText(text), contentWidth);
                    lines.forEach((line) => {
                        ensureSpace(5);
                        pdf.text(line, margin, y);
                        y += 4.2;
                    });
                    y += 2;
                };
                const addImage = (image, format, width, height, caption) => {
                    if (!image) return;
                    ensureSpace(height + 10);
                    try {
                        pdf.addImage(image, format, margin, y, width, height);
                        y += height + 4;
                        if (caption) addParagraph(caption, 8);
                    } catch (imageError) {
                        console.warn('Report image omitted:', imageError);
                    }
                };

                pdf.setFillColor(isThreat ? 153 : 2, isThreat ? 27 : 132, isThreat ? 27 : 199);
                pdf.rect(0, 0, pageWidth, 8, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(18);
                pdf.setTextColor(15, 23, 42);
                pdf.text('UAV SWARM INTELLIGENCE REPORT', margin, y + 7);
                y += 15;
                addParagraph(`Generated: ${new Date().toLocaleString()} | Source: ${meta.filename} | Resolution: ${meta.dimensions}`, 8);

                addHeading('Inference Summary');
                addParagraph(`Drone count: ${analytics.drone_count} | Alert level: ${analytics.alert} | Density: ${analytics.density} | Average confidence: ${analytics.average_confidence}%`);
                addParagraph(`Confidence range: ${analytics.min_confidence}% - ${analytics.max_confidence}% | Detection footprint: ${analytics.detection_footprint}% | Alert threshold: ${analytics.threshold} UAVs`);
                addParagraph(`Average bounding box: ${analytics.bbox_avg_width} x ${analytics.bbox_avg_height} px | Area range: ${analytics.bbox_smallest_area} - ${analytics.bbox_largest_area} px²`);
                addParagraph(`Centroid: ${analytics.centroid_x}, ${analytics.centroid_y} px | Spread: ${analytics.spread_width} x ${analytics.spread_height} px | Standard deviation: X ${analytics.std_dev_x} px, Y ${analytics.std_dev_y} px | NND: ${analytics.nearest_neighbor_distance} px`);

                addHeading('Annotated Detection Image');
                addImage(document.getElementById('annotatedImg'), 'JPEG', contentWidth, 105, 'Annotated YOLO26s inference output.');

                addHeading('AI Tactical Briefing');
                addParagraph(rawLlmMarkdown || analytics.scene_analysis);
                addHeading('Rule-Based Deterministic Analysis');
                addParagraph(analytics.scene_analysis);

                addHeading('Visual Analytics');
                addImage(radarImgData, 'PNG', contentWidth, 70, 'Spatial coordinate radar.');
                addImage(confidenceImgData, 'PNG', contentWidth, 70, 'Detection confidence distribution.');
                addImage(sizeImgData, 'PNG', contentWidth, 70, 'Target size distribution.');

                addHeading(`All Detected UAV Targets (${activeResultData.detections.length})`);
                pdf.setFont('courier', 'bold');
                pdf.setFontSize(8);
                pdf.setTextColor(15, 23, 42);
                ensureSpace(6);
                pdf.text('#     Confidence     Center (X, Y)     Size (W x H)', margin, y);
                y += 5;
                activeResultData.detections.forEach((d, index) => {
                    ensureSpace(5);
                    pdf.setFont('courier', 'normal');
                    pdf.setFontSize(8);
                    const row = `${String(index + 1).padStart(3)}   ${(d.confidence * 100).toFixed(1).padStart(6)}%       ${Math.round(d.center_x)}, ${Math.round(d.center_y)}          ${Math.round(d.width)} x ${Math.round(d.height)} px`;
                    pdf.text(row, margin, y);
                    y += 4;
                });

                pdf.save(filename);
                exportPdfBtn.removeAttribute('disabled');
                exportPdfBtn.innerHTML = '📄 Export PDF Report';
            } catch (err) {
                console.error('PDF generation failed:', err);
                exportPdfBtn.removeAttribute('disabled');
                exportPdfBtn.innerHTML = '📄 Export PDF Report';
                window.alert('PDF generation failed. Open the browser console for details.');
            }
        } else {
            window.print();
            exportPdfBtn.removeAttribute('disabled');
            exportPdfBtn.innerHTML = '📄 Export PDF Report';
        }
    });

    // 9. Render Detection Confidence Curve (Chart.js)
    function renderConfidenceCurveChart(detections, avgConfidence, isThreatActive) {
        const ctx = document.getElementById('confidenceChart').getContext('2d');
        
        if (confidenceChartInstance) {
            confidenceChartInstance.destroy();
        }

        const labels = detections.map((_, idx) => `#${idx + 1}`);
        const confValues = detections.map(d => parseFloat((d.confidence * 100).toFixed(1)));
        const avgArray = Array(labels.length).fill(avgConfidence);

        const curveColor = isThreatActive ? '#dc2626' : '#0284c7';
        const curveBg = isThreatActive ? 'rgba(220, 38, 38, 0.14)' : 'rgba(2, 132, 199, 0.12)';

        confidenceChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.length > 0 ? labels : ['No Target'],
                datasets: [
                    {
                        label: 'UAV Confidence (%)',
                        data: confValues.length > 0 ? confValues : [0],
                        borderColor: curveColor,
                        backgroundColor: curveBg,
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: curveColor,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Mean Confidence',
                        data: avgArray.length > 0 ? avgArray : [0],
                        borderColor: isThreatActive ? '#b91c1c' : '#10b981',
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
                        labels: { font: { size: 11, family: 'Inter' } }
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
                        ticks: { callback: v => v + '%', font: { family: 'JetBrains Mono' } },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        ticks: { font: { family: 'JetBrains Mono' } },
                        grid: { color: '#f8fafc' }
                    }
                }
            }
        });
    }

    // 10. Render Target Size Breakdown Chart (Chart.js)
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
                        ticks: { stepSize: 1, font: { family: 'JetBrains Mono' } },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        ticks: { font: { family: 'Inter', size: 11 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // 11. Draw normalized coordinate radar map on HTML5 Canvas
    function drawSpatialDistribution(detections, dimensionsStr, analytics) {
        const canvas = document.getElementById('spatialCanvas');
        const ctx = canvas.getContext('2d');
        
        const dims = dimensionsStr.split('×').map(d => parseInt(d.trim()));
        const origW = dims[0] || 1280;
        const origH = dims[1] || 720;
        
        const pad = 18;
        const cw = canvas.width;
        const ch = canvas.height;
        const isThreat = analytics.alert === 'SWARM ALERT';
        
        ctx.clearRect(0, 0, cw, ch);
        
        // Radar circular range rings
        ctx.strokeStyle = isThreat ? '#fee2e2' : '#f1f5f9';
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
            ctx.font = '12px Inter, sans-serif';
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
            ctx.strokeStyle = isThreat ? 'rgba(220, 38, 38, 0.45)' : 'rgba(13, 148, 136, 0.35)';
            ctx.lineWidth = isThreat ? 2 : 1.8;
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(px1, py1, px2 - px1, py2 - py1);
            ctx.setLineDash([]);
            ctx.fillStyle = isThreat ? 'rgba(220, 38, 38, 0.06)' : 'rgba(13, 148, 136, 0.04)';
            ctx.fillRect(px1, py1, px2 - px1, py2 - py1);
        }

        // Draw Target Pins
        detections.forEach((det, idx) => {
            const nx = det.center_x / origW;
            const ny = det.center_y / origH;
            const x = nx * (cw - 2 * pad) + pad;
            const y = ny * (ch - 2 * pad) + pad;
            
            const dotColor = isThreat ? '#dc2626' : '#0284c7';
            ctx.fillStyle = dotColor;
            ctx.beginPath();
            ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.strokeStyle = isThreat ? 'rgba(220, 38, 38, 0.5)' : 'rgba(2, 132, 199, 0.5)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(x, y, 9, 0, 2 * Math.PI);
            ctx.stroke();
            
            ctx.fillStyle = '#475569';
            ctx.font = 'bold 9px "JetBrains Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`#${idx + 1}`, x + 11, y + 3);
        });

        // Draw Swarm Centroid Crosshair
        const ncx = (analytics.centroid_x / origW) * (cw - 2 * pad) + pad;
        const ncy = (analytics.centroid_y / origH) * (ch - 2 * pad) + pad;
        
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        
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
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillText('Swarm Centroid', ncx + 10, ncy - 8);
    }
});
