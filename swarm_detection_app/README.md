# UAV Swarm Detection & AI Tactical Analytics Dashboard

A polished, modern local Flask web application designed for UAV/drone swarm detection, post-detection spatial analytics, and neural AI tactical summarization. The application performs real-time GPU-based inference using a fine-tuned **YOLO26s** model and produces rich multi-target situational briefings using **LLaMA 3 via Ollama** running locally on your GPU workstation.

---

## 1. Project Context & Purpose

The purpose of this project is to demonstrate multi-UAV detection capabilities using computer vision and deliver deep analytical insights on drone counts, spatial clustering, swarm density classification, alert levels, detection curves, and tactical AI briefings. The system is designed to run entirely locally on custom GPU hardware to ensure low latency and security, avoiding any external cloud APIs.

### Key Capabilities
- **YOLO26s GPU Inference:** High-resolution (1280×1280) real-time drone detection.
- **Ollama LLaMA 3 AI Briefings:** Automatically synthesizes detection coordinates into structured tactical intelligence reports using `llama3:latest`.
- **Interactive Threshold & Filter Sliders:** Live UI controls to adjust swarm alert count thresholds (1–40) and confidence filters (10%–90%) with instant scene recalculation.
- **Analytical Detection Curves (Chart.js):**
  - **Detection Confidence Spectrum Curve:** Visualizes sorted detection confidences alongside the mean certainty baseline.
  - **Target Size & Footprint Breakdown:** Bins targets into Small (<600 px²), Medium (600–1500 px²), and Large (>1500 px²) tiers.
- **Spatial Coordinate Radar (HTML5 Canvas):** Renders normalized drone target pins with indices, circular radar rings, swarm bounding envelopes, and centroid crosshairs.
- **Zero Raw-JSON Presentation:** Clean, publication-grade cards, badges, and responsive tables.

---

## 2. Python Environment & Installation

### Conda Environment Setup
Ensure the Conda environment `uavswarm` is configured and active.

```bash
# Activate the environment
conda activate uavswarm

# Install requirements
cd /mnt/ssd4tb/swarm_detection/swarm_detection_app
pip install -r requirements.txt
```

### Ollama LLM Setup (Local GPU)
Ensure Ollama is running and has `llama3:latest` pulled:
```bash
# Check if Ollama is running
ollama list

# If needed, pull the model
ollama pull llama3:latest
```

---

## 3. Configuration

The application is configured using environment variables with built-in defaults defined in `config.py`:

| Variable | Description | Default Value |
|---|---|---|
| `MODEL_PATH` | Path to the trained YOLO26s model | `/mnt/ssd4tb/swarm_detection/runs/uavswarm_yolo26s_1280_100ep/weights/best.pt` |
| `IMG_SIZE` | Model inference input resolution | `1280` |
| `CONF_THRESHOLD`| Confidence threshold for positive detection | `0.25` |
| `SWARM_THRESHOLD`| Number of drones required to trigger alert | `10` |
| `OLLAMA_HOST` | Local Ollama API endpoint | `http://localhost:11434` |
| `OLLAMA_MODEL` | Local LLM model identifier | `llama3:latest` |
| `DEVICE` | Target hardware device (0 for CUDA GPU 0, or 'cpu')| `0` |
| `MAX_UPLOAD_MB` | Maximum permitted file size | `10` |

---

## 4. Application Startup

Run the Flask application on port `5000`:

```bash
conda activate uavswarm
cd /mnt/ssd4tb/swarm_detection/swarm_detection_app
python app.py
```

### Access URL
Open your web browser and go to:
[http://localhost:5000](http://localhost:5000)

---

## 5. API Endpoints

### 1. `GET /api/health`
Health check endpoint reporting GPU status, YOLO model loading status, and Ollama LLaMA 3 readiness.

### 2. `POST /api/detect`
Uploads an image, runs GPU detection, compiles spatial analytics, calls Ollama LLaMA 3, and saves the annotated result.
- **Input:** `multipart/form-data` containing `image`, `swarm_threshold`, and `conf_threshold`.
- **Response:** Structured JSON containing metadata, detections array, analytics metrics, markdown `llm_summary`, and annotated image URL.

### 3. `POST /api/recalculate`
Dynamically recalculates analytics and queries LLaMA 3 when the user moves threshold sliders in the UI without re-running full YOLO inference.
- **Input:** JSON payload with `detections`, `dimensions`, `swarm_threshold`, and `conf_threshold`.

---

## 6. Analytics & Heuristic Definitions

- **Swarm Density Categories:**
  - `0`: No Drones Detected
  - `1–5`: Sparse
  - `6–10`: Moderate
  - `11–15`: Dense
  - `16–20`: Very Dense
  - `21+`: Highly Dense
- **Swarm Alert Heuristic:**
  - `NONE`: If drone count is 0.
  - `NORMAL`: If drone count is greater than 0 but less than the `SWARM_THRESHOLD`.
  - `SWARM_ALERT`: If drone count is equal to or greater than `SWARM_THRESHOLD`.
- **Estimated Detection Footprint:**
  $$\text{Footprint (\%)} = \left(\frac{\sum \text{Bounding Box Areas}}{\text{Image Area}}\right) \times 100$$
- **Nearest Neighbor Distance (NND):** Calculates the average distance in pixels from each detected drone center to its closest neighbor.
