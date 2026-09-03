import os
import uuid
import time
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename

import config
from detector import UAVDetector
from analytics import calculate_analytics
from llm_summary import generate_llm_scene_summary
from utils import allowed_file, get_system_status

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = config.MAX_UPLOAD_MB * 1024 * 1024

# Create upload and output directories if they don't exist
os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
os.makedirs(config.OUTPUT_FOLDER, exist_ok=True)

# Keep uploads and output files clean
def purge_old_files():
    """
    Deletes files older than 1 hour to prevent disk space leaks in local test environment.
    """
    now = time.time()
    max_age_seconds = 3600
    for folder in [config.UPLOAD_FOLDER, config.OUTPUT_FOLDER]:
        if not os.path.exists(folder):
            continue
        for filename in os.listdir(folder):
            if filename == '.gitkeep':
                continue
            filepath = os.path.join(folder, filename)
            try:
                if os.path.isfile(filepath) and os.stat(filepath).st_mtime < now - max_age_seconds:
                    os.remove(filepath)
            except Exception:
                pass

# Initialize detector on startup
detector = None
model_loaded = False
load_error = None

print("Loading YOLO26s detector once on startup...")
try:
    detector = UAVDetector(
        model_path=config.MODEL_PATH,
        imgsz=config.IMG_SIZE,
        conf=config.CONF_THRESHOLD,
        device=config.DEVICE
    )
    model_loaded = True
except Exception as e:
    load_error = str(e)
    print(f"CRITICAL: Failed to load YOLO26s model: {e}")

@app.route('/')
def index():
    """
    Serves the primary single-page UI dashboard.
    """
    return render_template('index.html')

@app.route('/api/detect', methods=['POST'])
def detect():
    """
    Endpoint for uploading images and running inference.
    Expects multipart/form-data with key 'image' and optional 'swarm_threshold' and 'conf_threshold'.
    Returns structured JSON with detection details, advanced analytics, and Ollama LLM summary.
    """
    # Clean up old upload and output files
    purge_old_files()

    if not model_loaded:
        return jsonify({
            "error": "Detector model is not initialized.",
            "detail": load_error
        }), 503

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided in request."}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "Selected file has an empty filename."}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Unsupported file format. Use JPG, JPEG, PNG, or WEBP."}), 400

    # Parse configurable thresholds from request or fallback to config defaults
    try:
        swarm_threshold = int(request.form.get('swarm_threshold', config.SWARM_THRESHOLD))
    except (ValueError, TypeError):
        swarm_threshold = config.SWARM_THRESHOLD

    try:
        conf_threshold = float(request.form.get('conf_threshold', config.CONF_THRESHOLD))
    except (ValueError, TypeError):
        conf_threshold = config.CONF_THRESHOLD

    try:
        # Determine file extensions and safe UUID file naming
        ext = file.filename.rsplit('.', 1)[1].lower()
        image_id = str(uuid.uuid4())
        
        orig_filename = f"{image_id}_orig.{ext}"
        annotated_filename = f"{image_id}_annotated.{ext}"
        
        orig_path = os.path.join(config.UPLOAD_FOLDER, orig_filename)
        annotated_path = os.path.join(config.OUTPUT_FOLDER, annotated_filename)
        
        # Save uploaded image file
        file.save(orig_path)
        file_size_bytes = os.path.getsize(orig_path)
        
        # Run YOLO detection
        detections, orig_w, orig_h = detector.detect(orig_path, annotated_path)
        
        # Filter detections if a custom conf_threshold was passed
        filtered_detections = [d for d in detections if d.get('confidence', 0.0) >= conf_threshold]
        
        # Run advanced analytics calculations
        analytics = calculate_analytics(
            filtered_detections, 
            orig_w, 
            orig_h, 
            swarm_threshold=swarm_threshold
        )
        
        metadata = {
            "filename": secure_filename(file.filename),
            "dimensions": f"{orig_w} × {orig_h}",
            "inference_resolution": f"{config.IMG_SIZE} × {config.IMG_SIZE}",
            "model": "YOLO26s",
            "file_size_kb": round(file_size_bytes / 1024, 1),
            "conf_threshold": conf_threshold,
            "swarm_threshold": swarm_threshold
        }

        # Generate AI Scene Summary via Ollama (llama3:latest)
        llm_summary = generate_llm_scene_summary(filtered_detections, analytics, metadata)
        
        # Build clean visual dashboard response structure
        return jsonify({
            "status": "success",
            "metadata": metadata,
            "detections": filtered_detections,
            "analytics": analytics,
            "llm_summary": llm_summary,
            "annotated_image_url": f"/static/outputs/{annotated_filename}"
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": "An error occurred during inference.",
            "detail": str(e)
        }), 500

@app.route('/api/recalculate', methods=['POST'])
def recalculate():
    """
    Recalculates analytics and LLM summary dynamically when user adjusts the
    threshold slider in the UI without re-running full YOLO inference.
    """
    data = request.get_json(silent=True) or {}
    detections = data.get('detections', [])
    dimensions_str = data.get('dimensions', '1280 × 720')
    swarm_threshold = int(data.get('swarm_threshold', config.SWARM_THRESHOLD))
    conf_threshold = float(data.get('conf_threshold', config.CONF_THRESHOLD))
    filename = data.get('filename', 'scene_image.jpg')

    # Parse dimensions
    try:
        dims = [int(p.strip().replace('px','')) for p in dimensions_str.split('×')]
        orig_w, orig_h = dims[0], dims[1]
    except Exception:
        orig_w, orig_h = 1280, 720

    filtered_detections = [d for d in detections if d.get('confidence', 0.0) >= conf_threshold]
    analytics = calculate_analytics(filtered_detections, orig_w, orig_h, swarm_threshold=swarm_threshold)

    metadata = {
        "filename": filename,
        "dimensions": f"{orig_w} × {orig_h}",
        "inference_resolution": f"{config.IMG_SIZE} × {config.IMG_SIZE}",
        "model": "YOLO26s",
        "conf_threshold": conf_threshold,
        "swarm_threshold": swarm_threshold
    }

    llm_summary = generate_llm_scene_summary(filtered_detections, analytics, metadata)

    return jsonify({
        "status": "success",
        "analytics": analytics,
        "llm_summary": llm_summary,
        "detections": filtered_detections,
        "metadata": metadata
    })

@app.route('/api/health', methods=['GET'])
def health():
    """
    Standard health check endpoint reporting hardware, model, and Ollama details.
    """
    sys_status = get_system_status()
    return jsonify({
        "status": "Ready" if model_loaded else "Error",
        "model_loaded": model_loaded,
        "load_error": load_error,
        "gpu_availability": sys_status['cuda_available'],
        "gpu_name": sys_status['gpu_name'],
        "device": sys_status['device_name'],
        "model": "YOLO26s",
        "image_size": config.IMG_SIZE,
        "confidence_threshold": config.CONF_THRESHOLD,
        "swarm_threshold": config.SWARM_THRESHOLD,
        "ollama": sys_status.get('ollama', {})
    })

@app.errorhandler(413)
def request_entity_too_large(error):
    """
    Custom handler for requests exceeding size limits.
    """
    return jsonify({"error": f"Image file exceeds maximum upload size of {config.MAX_UPLOAD_MB}MB."}), 413

if __name__ == '__main__':
    # Print custom startup banner
    sys_status = get_system_status()
    ollama_info = sys_status.get('ollama', {})
    ollama_status_str = f"Ready ({ollama_info.get('model')})" if ollama_info.get('reachable') else f"Configured ({config.OLLAMA_MODEL} @ {config.OLLAMA_HOST})"

    print("==================================================")
    print("UAV SWARM DETECTION & AI ANALYTICS DASHBOARD")
    print("==================================================")
    print(f"Model: YOLO26s (UAVSwarm fine-tuned)")
    print(f"Device: {sys_status['device_name']}")
    print(f"GPU: {sys_status['gpu_name']}")
    print(f"Ollama LLM: {ollama_status_str}")
    print(f"Image Size: {config.IMG_SIZE}")
    print(f"Confidence Threshold: {config.CONF_THRESHOLD}")
    print(f"Swarm Alert Threshold: {config.SWARM_THRESHOLD}")
    print("Server: http://0.0.0.0:5000")
    print("==================================================")
    
    app.run(host='0.0.0.0', port=5000, debug=False)
