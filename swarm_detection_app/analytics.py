import math

def calculate_analytics(detections, img_w, img_h, swarm_threshold=10):
    """
    Performs full analysis on the list of detections.
    Args:
        detections: list of dicts from detector.py (sorted by conf)
        img_w: original image width (pixels)
        img_h: original image height (pixels)
        swarm_threshold: threshold count for SWARM ALERT trigger
    Returns:
        dict containing processed analytics.
    """
    drone_count = len(detections)
    
    # 1. Confidence Metrics
    if drone_count > 0:
        confidences = [d['confidence'] * 100 for d in detections] # scale to percentage
        avg_conf = sum(confidences) / drone_count
        min_conf = min(confidences)
        max_conf = max(confidences)
    else:
        avg_conf = 0.0
        min_conf = 0.0
        max_conf = 0.0
        
    # 2. Swarm Density classification
    if drone_count == 0:
        density = "No Drones Detected"
    elif 1 <= drone_count <= 5:
        density = "Sparse"
    elif 6 <= drone_count <= 10:
        density = "Moderate"
    elif 11 <= drone_count <= 15:
        density = "Dense"
    elif 16 <= drone_count <= 20:
        density = "Very Dense"
    else:
        density = "Highly Dense"
        
    # 3. Swarm Alert Level heuristic
    if drone_count == 0:
        alert = "NONE"
    elif drone_count < swarm_threshold:
        alert = "NORMAL"
    else:
        alert = "SWARM ALERT"
        
    # 4. Estimated Detection Footprint (%)
    # Sum of bounding box areas divided by image area, multiplied by 100
    image_area = img_w * img_h
    if image_area > 0 and drone_count > 0:
        bbox_area_sum = sum(d['width'] * d['height'] for d in detections)
        detection_footprint = (bbox_area_sum / image_area) * 100
    else:
        detection_footprint = 0.0
        
    # 5. Average Bounding Box Dimensions
    if drone_count > 0:
        avg_bbox_w = sum(d['width'] for d in detections) / drone_count
        avg_bbox_h = sum(d['height'] for d in detections) / drone_count
        smallest_area = min(d['width'] * d['height'] for d in detections)
        largest_area = max(d['width'] * d['height'] for d in detections)
    else:
        avg_bbox_w = 0.0
        avg_bbox_h = 0.0
        smallest_area = 0.0
        largest_area = 0.0
        
    # 6. Centroid and Spatial Spread
    # Centroid: average center_x and center_y
    if drone_count > 0:
        cx_avg = sum(d['center_x'] for d in detections) / drone_count
        cy_avg = sum(d['center_y'] for d in detections) / drone_count
        
        # Spatial spread bounding region (bounding box covering all centroids or boxes)
        min_x = min(d['x1'] for d in detections)
        max_x = max(d['x2'] for d in detections)
        min_y = min(d['y1'] for d in detections)
        max_y = max(d['y2'] for d in detections)
        
        spread_w = max_x - min_x
        spread_h = max_y - min_y
        
        # Standard deviation of centers
        std_x = math.sqrt(sum((d['center_x'] - cx_avg) ** 2 for d in detections) / drone_count)
        std_y = math.sqrt(sum((d['center_y'] - cy_avg) ** 2 for d in detections) / drone_count)
    else:
        cx_avg, cy_avg = 0.0, 0.0
        spread_w, spread_h = 0.0, 0.0
        std_x, std_y = 0.0, 0.0
        
    # 7. Nearest-Neighbor Distance (NND)
    # Average distance from each detection center to its closest neighbor center
    nnd_avg = 0.0
    if drone_count > 1:
        total_nnd = 0.0
        for i, d1 in enumerate(detections):
            min_dist = float('inf')
            cx1, cy1 = d1['center_x'], d1['center_y']
            for j, d2 in enumerate(detections):
                if i == j:
                    continue
                cx2, cy2 = d2['center_x'], d2['center_y']
                dist = math.sqrt((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2)
                if dist < min_dist:
                    min_dist = dist
            total_nnd += min_dist
        nnd_avg = total_nnd / drone_count
        
    # 8. Deterministic Scene Analysis Summary Text
    scene_summary = generate_scene_analysis(
        drone_count, avg_conf, density, alert, swarm_threshold, 
        {'x': cx_avg, 'y': cy_avg}, {'width': spread_w, 'height': spread_h},
        img_w, img_h
    )
    
    return {
        'drone_count': drone_count,
        'average_confidence': round(avg_conf, 1),
        'min_confidence': round(min_conf, 1),
        'max_confidence': round(max_conf, 1),
        'density': density,
        'alert': alert,
        'threshold': swarm_threshold,
        'detection_footprint': round(detection_footprint, 3),
        'bbox_avg_width': round(avg_bbox_w, 1),
        'bbox_avg_height': round(avg_bbox_h, 1),
        'bbox_smallest_area': round(smallest_area, 1),
        'bbox_largest_area': round(largest_area, 1),
        'centroid_x': round(cx_avg, 1),
        'centroid_y': round(cy_avg, 1),
        'spread_width': round(spread_w, 1),
        'spread_height': round(spread_h, 1),
        'std_dev_x': round(std_x, 1),
        'std_dev_y': round(std_y, 1),
        'nearest_neighbor_distance': round(nnd_avg, 1),
        'scene_analysis': scene_summary
    }

def generate_scene_analysis(drone_count, avg_conf, density, alert, threshold, centroid, spread, img_w, img_h):
    """
    Generates a deterministic, objective paragraph describing the scene.
    Does not use an LLM or assert intent/hostility.
    """
    if drone_count == 0:
        return "No UAVs were detected in the scene. The monitored area remains below the configured alert threshold."
        
    # Determine location region based on centroid
    region_x = "center"
    if centroid['x'] < img_w / 3:
        region_x = "left"
    elif centroid['x'] > 2 * img_w / 3:
        region_x = "right"
        
    region_y = "central"
    if centroid['y'] < img_h / 3:
        region_y = "upper"
    elif centroid['y'] > 2 * img_h / 3:
        region_y = "lower"
        
    if region_y == "central" and region_x == "center":
        location = "central region"
    else:
        location = f"{region_y}-{region_x} sector"
        
    # Check spatial dispersion
    w_frac = spread['width'] / img_w if img_w > 0 else 0
    h_frac = spread['height'] / img_h if img_h > 0 else 0
    
    if w_frac > 0.6 or h_frac > 0.6:
        dispersion = "widely distributed across the coordinate space"
    elif w_frac < 0.25 and h_frac < 0.25:
        dispersion = f"tightly clustered within the {location}"
    else:
        dispersion = f"moderately spread across the {location}"
        
    # Format alert description
    if alert == "SWARM ALERT":
        alert_desc = f" This count exceeds the configured swarm threshold of {threshold} UAVs, resulting in a Swarm Alert status."
    else:
        alert_desc = f" This count remains within the normal bounds of the configured swarm threshold ({threshold} UAVs)."
        
    text = (
        f"{drone_count} UAV{'s' if drone_count > 1 else ''} detected "
        f"with an average confidence of {avg_conf:.1f}%. "
        f"The configuration is classified as a {density} swarm.{alert_desc} "
        f"Spatial distribution indicates the detected units are {dispersion}."
    )
    return text
