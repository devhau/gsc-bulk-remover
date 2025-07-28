import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./popup.css";

const Popup = () => {
  const [links, setLinks] = useState("");
  const [waitTime, setWaitTime] = useState(30);
  const [chunkSize, setChunkSize] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleStart = async () => {
    if (isProcessing) {
      return;
    }
    
    const urlList = links.split('\n').filter(url => url.trim().split(',')[0]);
    if (urlList.length === 0) {
      alert("Please enter valid URLs");
      return;
    }
    
    if (urlList.length > 1000) {
      alert("Maximum 1000 URLs allowed");
      return;
    }
    
    // Validate URLs
    const validUrls = urlList.filter(url => url.startsWith('http'));
    if (validUrls.length === 0) {
      alert("Please enter valid URLs starting with http:// or https://");
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Store configuration in Chrome storage
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({
          URLs: validUrls.join('\n'),
          waitTime: waitTime,
          chunkSize: chunkSize,
          downloadCheckbox: false, // Can be made configurable later
          temporaryRemoval: true, // Can be made configurable later
          currentChunkIndex: 0,
          totalChunks: Math.ceil(validUrls.length / chunkSize),
          submittedLinksAll: [],
          failedLinksAll: [],
          totalURLCount: validUrls.length,
          processedURLCount: 0,
          stopRequested: false,
          isProcessing: true,
          lastUpdateTime: Date.now()
        }, () => {
          resolve();
        });
      });
      
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.id) {
        throw new Error('No active tab found');
      }
      
      // Check if we're on Google Search Console
      if (!tab.url?.includes('search.google.com')) {
        alert('Please navigate to Google Search Console first');
        setIsProcessing(false);
        return;
      }
      
      // Send message to content script to start processing
      chrome.tabs.sendMessage(tab.id, {
        action: 'startProcessing',
        data: {
          urls: validUrls,
          waitTime: waitTime,
          chunkSize: chunkSize
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError);
          alert('Error starting process. Please refresh the page and try again.');
          setIsProcessing(false);
        } else {
          console.log('Process started successfully:', response);
        }
      });
      
    } catch (error) {
      console.error('Error starting process:', error);
      alert('Error starting process. Please try again.');
      setIsProcessing(false);
    }
  };

  const handleStop = async () => {
    try {
      // Set stop flag in storage
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ 
          stopRequested: true,
          isProcessing: false 
        }, () => {
          resolve();
        });
      });
      
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab.id) {
        // Send stop message to content script
        chrome.tabs.sendMessage(tab.id, {
          action: 'stopProcessing'
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending stop message:', chrome.runtime.lastError);
          } else {
            console.log('Stop message sent:', response);
          }
        });
      }
      
      setIsProcessing(false);
      console.log('Process stopped');
      
    } catch (error) {
      console.error('Error stopping process:', error);
      setIsProcessing(false);
    }
  };

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="popup-header">
        <h2 className="popup-title">
          GSC Bulk Remover
        </h2>
        <p className="popup-subtitle">
          Remove multiple URLs from Google Search Console
        </p>
      </div>

      {/* Content */}
      <div className="popup-content">
        {/* URL Input Section */}
        <div className="url-input-section">
          <label htmlFor="links" className="url-input-label">
            📋 URLs to Remove
          </label>
          <div className="url-input-wrapper">
            <textarea
              id="links"
              className="url-textarea"
              placeholder="https://example.com/page1\nhttps://example.com/page2\n...\n\nPaste your URLs here, one per line (max 1000)"
              value={links}
              onChange={(e) => setLinks(e.target.value)}
            />
            <div className="url-counter">
              {links.split('\n').filter(url => url.trim()).length}/1000
            </div>
          </div>
        </div>
        
        {/* Configuration Section */}
        <div className="config-section">
          {/* Wait Time */}
          <div className="config-item">
            <label htmlFor="wait-time" className="config-label">
              ⏱️ Wait Time (sec)
            </label>
            <input
              type="number"
              id="wait-time"
              className="config-input"
              min="10"
              max="300"
              value={waitTime}
              step="1"
              onChange={(e) => setWaitTime(parseInt(e.target.value) || 30)}
            />
            <small className="config-help">
              10-300 seconds between chunks
            </small>
          </div>
          
          {/* Chunk Size */}
          <div className="config-item">
            <label htmlFor="chunk-size" className="config-label">
              📦 Chunk Size
            </label>
            <input
              type="number"
              id="chunk-size"
              className="config-input"
              min="1"
              max="500"
              value={chunkSize}
              step="1"
              onChange={(e) => setChunkSize(parseInt(e.target.value) || 100)}
            />
            <small className="config-help">
              1-500 URLs per batch
            </small>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button
            id="startBtn"
            className={`action-button start-button ${isProcessing ? '' : ''}`}
            onClick={handleStart}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <div className="loading-spinner"></div>
                Processing...
              </>
            ) : (
              <>
                <svg className="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Start Process
              </>
            )}
          </button>
          
          <button
            id="stopBtn"
            className={`action-button stop-button ${isProcessing ? 'active' : ''}`}
            onClick={handleStop}
            disabled={!isProcessing}
          >
            <svg className="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            </svg>
            Stop
          </button>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
