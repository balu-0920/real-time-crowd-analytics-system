# real-time-crowd-analytics-system
Crowd monitoring system using computer vision to detect and analyze crowd density from CCTV feeds.


# Crowd Management System

The Crowd Management System is an AI-based solution designed to monitor crowd levels in public places such as stadiums, railway stations, malls, and large events.
The system uses CCTV video feeds and computer vision to detect people and estimate the number of individuals present in a location in real time. This helps authorities monitor overcrowding and improve public safety.

The system works by capturing video from CCTV cameras, processing each frame using an object detection model, counting the number of detected people, and displaying the information for monitoring and analysis.

## System Workflow

1. CCTV cameras capture live video from a location.
2. Video frames are processed using a YOLO-based object detection model.
3. The model detects individuals present in the frame.
4. The system counts the number of detected people.
5. The crowd data is sent to the backend for monitoring and storage.
6. Authorities can view crowd information through a monitoring dashboard.

## Modules

### Module 1: Real-Time Crowd Detection & Counting

This module is responsible for detecting and counting people in real time using CCTV video streams.

The system processes video frames using a **YOLO object detection model**, which identifies people in each frame. After detection, the system counts the number of detected individuals and updates the crowd count continuously.

Key functions of this module include:

* Processing CCTV video frames
* Detecting people using a trained YOLO model
* Counting the number of detected individuals
* Providing real-time crowd statistics
* Sending crowd data to the backend system

This module forms the **core component of the project**, as accurate detection and counting are necessary for analyzing crowd conditions and triggering alerts.

### Module 2: Crowd Density Analysis

Analyzes crowd data to estimate density levels and identify crowded areas.

### Module 3: Data Storage & Analytics

Stores crowd statistics and historical monitoring data in a database.

### Module 4: Web Dashboard & Monitoring

Provides a web interface where administrators can monitor crowd information.

### Module 5: Alert System

Generates alerts when the crowd level exceeds predefined safety limits.

## Technologies Used

* Python
* YOLO (Object Detection Model)
* OpenCV
* Node.js
* MongoDB
* HTML, CSS, JavaScript

