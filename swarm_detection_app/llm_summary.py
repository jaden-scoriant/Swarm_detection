import json
import logging
import urllib.request
import urllib.error
import config

logger = logging.getLogger(__name__)

def generate_llm_scene_summary(detections, analytics, metadata, custom_prompt_notes=""):
    """
    Generates a rich, structured, tactical scene analysis using local Ollama LLM (llama3:latest).
    Falls back gracefully to deterministic rule-based analysis if Ollama is unreachable.
    """
    drone_count = analytics.get('drone_count', len(detections))
    avg_conf = analytics.get('average_confidence', 0.0)
    min_conf = analytics.get('min_confidence', 0.0)
    max_conf = analytics.get('max_confidence', 0.0)
    density = analytics.get('density', 'Unknown')
    alert = analytics.get('alert', 'NONE')
    threshold = analytics.get('threshold', config.SWARM_THRESHOLD)
    footprint = analytics.get('detection_footprint', 0.0)
    spread_w = analytics.get('spread_width', 0.0)
    spread_h = analytics.get('spread_height', 0.0)
    cx = analytics.get('centroid_x', 0.0)
    cy = analytics.get('centroid_y', 0.0)
    nnd = analytics.get('nearest_neighbor_distance', 0.0)
    img_dims = metadata.get('dimensions', 'N/A')

    if drone_count == 0:
        return (
            "### Executive Summary\n"
            "No unmanned aerial vehicles (UAVs) were detected within the analyzed frame. "
            "Airspace remains clear and below all monitored thresholds."
        )

    # Construct prompt for LLaMA 3
    system_prompt = (
        "You are an expert AI Tactical Drone & Computer Vision Analyst evaluating aerial surveillance imagery. "
        "Analyze the provided JSON detection telemetry from a high-resolution YOLO26s detector. "
        "Provide a clear, structured, professional, and actionable intelligence briefing. "
        "Keep the language technical, objective, and analytical. Do not invent fabricated targets. "
        "Structure your output with clean Markdown headings:\n"
        "1. **Executive Situation Assessment** (Count, Swarm Density, Alert State vs Threshold)\n"
        "2. **Swarm Formation & Spatial Geometry** (Centroid sector, dispersion, proximity clustering/NND)\n"
        "3. **Sensor Footprint & Detection Quality** (Confidence distribution, bounding dimensions)\n"
        "4. **Tactical & Operational Assessment** (Formations, density threat rating, recommended surveillance posture)"
    )

    user_payload = {
        "source_image_dimensions": img_dims,
        "detection_count": drone_count,
        "average_confidence_percent": avg_conf,
        "confidence_range": f"{min_conf}% - {max_conf}%",
        "swarm_density_classification": density,
        "alert_level": alert,
        "alert_threshold_limit": threshold,
        "sensor_footprint_percent": footprint,
        "swarm_centroid": {"center_x_px": cx, "center_y_px": cy},
        "spatial_spread_box": {"width_px": spread_w, "height_px": spread_h},
        "average_nearest_neighbor_distance_px": nnd,
        "individual_target_samples": [
            {
                "target_index": idx + 1,
                "confidence_percent": round(d.get('confidence', 0.0) * 100, 1),
                "position": {"x": d.get('center_x'), "y": d.get('center_y')},
                "size_px": {"w": d.get('width'), "h": d.get('height')}
            }
            for idx, d in enumerate(detections[:8]) # Pass top 8 for context
        ]
    }

    prompt_text = (
        f"{system_prompt}\n\n"
        f"--- TELEMETRY DATA ---\n"
        f"{json.dumps(user_payload, indent=2)}\n\n"
        f"Generate the comprehensive analysis based on the above telemetry."
    )

    ollama_url = f"{config.OLLAMA_HOST.rstrip('/')}/api/generate"
    req_data = {
        "model": config.OLLAMA_MODEL,
        "prompt": prompt_text,
        "stream": False,
        "options": {
            "temperature": 0.3,
            "top_p": 0.9,
            "num_predict": 500
        }
    }

    try:
        req = urllib.request.Request(
            ollama_url,
            data=json.dumps(req_data).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=config.OLLAMA_TIMEOUT) as response:
            if response.status == 200:
                resp_json = json.loads(response.read().decode('utf-8'))
                llm_response = resp_json.get('response', '').strip()
                if llm_response:
                    return llm_response
    except Exception as e:
        logger.warning(f"Ollama inference failed ({e}). Using deterministic fallback.")

    # Fallback if Ollama is not active or times out
    fallback_text = analytics.get('scene_analysis', '')
    alert_tag = "⚠️ **SWARM ALERT TRIGGERED**" if alert == "SWARM ALERT" else "🟢 **NORMAL ACTIVITY**"
    
    return (
        f"### Executive Situation Assessment\n"
        f"- **Status:** {alert_tag}\n"
        f"- **Count:** {drone_count} UAVs detected (Configured Threshold: {threshold})\n"
        f"- **Density:** Classified as **{density}** ({avg_conf:.1f}% mean confidence)\n\n"
        f"### Spatial & Formation Analysis\n"
        f"{fallback_text}\n\n"
        f"### Sensor & Proximity Telemetry\n"
        f"- **Estimated Detection Footprint:** {footprint:.3f}% of total image area\n"
        f"- **Average Inter-Drone Distance (NND):** {nnd:.1f} px\n"
        f"- **Spatial Enclosure Area:** {spread_w:.0f} × {spread_h:.0f} px\n\n"
        f"*(Note: Generated via internal rule engine. To activate full AI neural synthesis, ensure Ollama is running `llama3:latest` on `{config.OLLAMA_HOST}`)*"
    )
