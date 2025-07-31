import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./popup.css";

const setLocalData = async (data: any) => {
  await new Promise<void>((resolve) => {
    chrome.storage.local.set(
      {
        ...data,
      },
      () => {
        resolve();
      }
    );
  });
};
let timerUpdatePopupUI: NodeJS.Timeout | undefined;
const Popup = () => {
  const [links, setLinks] = useState("");
  const [waitTime, setWaitTime] = useState(30);
  const [chunkSize, setChunkSize] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const loadStoredData = async () => {
    try {
      const data = await new Promise<any>((resolve) => {
        chrome.storage.local.get(
          ["URLs", "waitTime", "chunkSize", "isProcessing"],
          (result) => {
            resolve(result);
          }
        );
      });

      // Load stored values into state
      if (data.URLs) {
        setLinks(data.URLs);
      }
      if (data.waitTime) {
        setWaitTime(data.waitTime);
      }
      if (data.chunkSize) {
        setChunkSize(data.chunkSize);
      }
      if (data.isProcessing) {
        setIsProcessing(data.isProcessing);
      }
      console.log("Loaded data from storage:", data);
    } catch (error) {
      console.error("Error loading data from storage:", error);
    }
  };
  // Load data from storage when popup opens
  useEffect(() => {
    if (isProcessing) {
      console.log("Update popup UI");
      if (timerUpdatePopupUI) {
        clearInterval(timerUpdatePopupUI);
      }
      timerUpdatePopupUI = setInterval(() => {
        loadStoredData();
      }, 2000);
    } else {
      clearInterval(timerUpdatePopupUI);
      console.log("Stop update popup UI");
      timerUpdatePopupUI = undefined;
    }
    return () => {
      clearInterval(timerUpdatePopupUI);
    };
  }, [isProcessing]);
  React.useEffect(() => {
    loadStoredData();
    const handleEvent = (message: any) => {
      if (message.action === "updatePopupUI") {
        loadStoredData();
      }
    };
    // Add listener for messages from content script
    chrome.runtime.onMessage.addListener(handleEvent);

    // Clean up listener on component unmount
    return () => {
      chrome.runtime.onMessage.removeListener(handleEvent);
    };
  }, []);

  // Save data to storage whenever input values change
  React.useEffect(() => {
    const saveToStorage = () => {
      chrome.storage.local.set({
        URLs: links,
        waitTime: waitTime,
        chunkSize: chunkSize,
      });
    };

    // Only save if we have some data (avoid saving empty initial state)
    if (links || waitTime !== 30 || chunkSize !== 100) {
      saveToStorage();
    }
  }, [links, waitTime, chunkSize]);

  const handleStart = async () => {
    if (isProcessing) {
      return;
    }

    const urlList = links
      .split("\n")
      .filter((url) => url.trim())
      .map((url) => url.split(",")[0].trim())
      .filter((url) => url.length > 0);
    if (urlList.length === 0) {
      alert("Please enter valid URLs");
      return;
    }

    if (urlList.length > 1000) {
      alert("Maximum 1000 URLs allowed");
      return;
    }

    // Validate URLs
    const validUrls = urlList.filter((url) => url.startsWith("http"));
    if (validUrls.length === 0) {
      alert("Please enter valid URLs starting with http:// or https://");
      return;
    }

    setIsProcessing(true);

    try {
      // Store configuration in Chrome storage

      await setLocalData({
        URLs: validUrls.join("\n"),
        waitTime: waitTime,
        chunkSize: chunkSize,
        stopRequested: false,
        isProcessing: true,
        lastUpdateTime: Date.now(),
      });

      // Get current active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.id) {
        throw new Error("No active tab found");
      }

      // Check if we're on Google Search Console
      if (!tab.url?.includes("search.google.com")) {
        alert("Please navigate to Google Search Console first");
        setIsProcessing(false);
        return;
      }

      // Send message to content script to start processing
      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "startProcessing",
          data: {
            tabId: tab.id,
            urls: validUrls,
            waitTime: waitTime,
            chunkSize: chunkSize,
          },
        },
        async (response) => {
          if (chrome.runtime.lastError) {
            // Set stop flag in storage
            await setLocalData({
              stopRequested: true,
              isProcessing: false,
            });
            console.error("Error sending message:", chrome.runtime.lastError);
            alert(
              "Error starting process. Please refresh the page and try again."
            );
            setIsProcessing(false);
          } else {
            console.log("Process started successfully:", response);
          }
        }
      );
    } catch (error) {
      console.error("Error starting process:", error);
      alert("Error starting process. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleStop = async () => {
    try {
      // Set stop flag in storage
      await setLocalData({
        stopRequested: true,
        isProcessing: false,
      });
      // Get current active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab.id) {
        // Send stop message to content script
        chrome.tabs.sendMessage(
          tab.id,
          {
            action: "stopProcessing",
          },
          async (response) => {
            if (chrome.runtime.lastError) {
              // Set stop flag in storage
              await setLocalData({
                stopRequested: true,
                isProcessing: false,
              });
              console.error(
                "Error sending stop message:",
                chrome.runtime.lastError
              );
            } else {
              console.log("Stop message sent:", response);
            }
          }
        );
      }

      setIsProcessing(false);
      console.log("Process stopped");
    } catch (error) {
      console.error("Error stopping process:", error);
      setIsProcessing(false);
    }
  };

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="popup-header">
        <h2 className="popup-title">GSC Bulk Remover</h2>
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
              rows={10}
              disabled={isProcessing}
            />
            <div className="url-counter">
              {links.split("\n").filter((url) => url.trim()).length}/1000
            </div>
          </div>
        </div>

        {/* Configuration Section */}
        <div className="config-section">
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
            <small className="config-help">1-500 URLs per batch</small>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button
            id="startBtn"
            className={`action-button start-button ${isProcessing ? "" : ""}`}
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
                <svg
                  className="icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                >
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Start Process
              </>
            )}
          </button>

          <button
            id="stopBtn"
            className={`action-button stop-button ${
              isProcessing ? "active" : ""
            }`}
            onClick={handleStop}
            disabled={!isProcessing}
          >
            <svg
              className="icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
            >
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
