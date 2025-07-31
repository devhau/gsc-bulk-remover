console.log("GSC Bulk Remover content script loaded");

// Variables to track popup state
let popup: HTMLElement | null = null;
let currentChunkIndexElement: HTMLElement | null = null;
let totalChunksElement: HTMLElement | null = null;
let currentIndexElement: HTMLElement | null = null;

// Function to create and show the popup
function createAndShowPopup() {
  if (popup) return; // Popup already exists

  // Inject our CSS
  const style = document.createElement("link");
  style.href = chrome.runtime.getURL("website-popup.css");
  style.type = "text/css";
  style.rel = "stylesheet";
  (document.head || document.documentElement).appendChild(style);

  // Create and inject the popup HTML with chunk information only
  const popupHTML = `
    <div class="gsc-remover-popup" id="gsc-remover-popup">
      <div class="gsc-remover-popup-header">
        <h3 class="gsc-remover-popup-title">GSC Bulk Remover - Progress</h3>
        <button class="gsc-remover-popup-close" id="gsc-remover-close">×</button>
      </div>
      <div class="gsc-remover-popup-body">
        <div class="chunk-info">
          <div class="chunk-item">
            <label>Current Chunk:</label>
            <span id="current-chunk-index">0</span>
          </div>
          <div class="chunk-item">
            <label>Total Chunks:</label>
            <span id="total-chunks">0</span>
          </div>
          <div class="chunk-item">
            <label>Current Index:</label>
            <span id="current-index">0</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add the popup to the page
  const popupContainer = document.createElement("div");
  popupContainer.innerHTML = popupHTML;
  document.body.appendChild(popupContainer);

  // Get DOM elements
  popup = document.getElementById("gsc-remover-popup");
  const closeButton = document.getElementById("gsc-remover-close");
  currentChunkIndexElement = document.getElementById("current-chunk-index");
  totalChunksElement = document.getElementById("total-chunks");
  currentIndexElement = document.getElementById("current-index");

  // Close button handler
  closeButton?.addEventListener("click", () => {
    popup?.remove();
    popup = null;
  });
}

// Define interface for chunk state
interface ChunkState {
  currentChunkIndex: number;
  totalChunks: number;
  index: number;
  totalUrls: number;
}

// Update UI based on chunk state
function updateChunkUI(state: ChunkState) {
  if (!popup) return;

  if (currentChunkIndexElement) {
    currentChunkIndexElement.textContent = (
      state.currentChunkIndex + 1
    ).toString();
  }

  if (totalChunksElement) {
    totalChunksElement.textContent = state.totalChunks.toString();
  }

  if (currentIndexElement) {
    currentIndexElement.textContent =
      (state.index + 1).toString() + "/" + state.totalUrls.toString();
  }
}

// No need for message listeners since we handle chunk updates directly

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
// Add a listener for messages from the popup
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "startProcessing") {
    try {
      console.log("Start processing requested", message.data);
      startProcess(message.data);
      sendResponse({ status: "Processing started" });
    } catch (error) {
      console.error("Error starting process:", error);
      sendResponse({ status: "Error starting process" });
    }
    return true;
  }

  if (message.action === "stopProcessing") {
    console.log("Stop processing requested");
    chrome.storage.local.set({ stopRequested: true }, () => {
      sendResponse({ status: "Stopping process" });
    });
    return true;
  }
});
async function isStopProcess() {
  const stopData = await new Promise<any>((resolve) =>
    chrome.storage.local.get(["stopRequested"], resolve)
  );
  if (stopData.stopRequested) {
    console.log("Process stopped by user during URL processing.");
    return true;
  }
  return false;
}
function startProcess(data: any) {
  linksResubmission(data.urls, [], 0, data.chunkSize ?? 100, data.tabId);
}
// Main function to process URLs
async function linksResubmission(
  allUrls: string[],
  doneUrls: string[] = [],
  chunkIndex: number = 0,
  chunkSize: number = 100,
  tabId: number
) {
  console.log("Starting URL removal process");
  if (allUrls.length === 0) {
    alert(getMessage("noValidUrls"));
    return;
  }
  if (await isStopProcess()) {
    return; // Stop processing if requested
  }
  const startIndex = chunkIndex * chunkSize;
  const endIndex = Math.min(startIndex + chunkSize, allUrls.length);
  const totalChunks = Math.ceil(allUrls.length / chunkSize);
  const urlListTrimmed = allUrls.slice(startIndex, endIndex);
  const totalUrls = urlListTrimmed.length;
  console.log(
    `Processing chunk ${chunkIndex + 1} of ${totalChunks} (URLs ${
      startIndex + 1
    } to ${endIndex} of ${allUrls.length})`
  );
  createAndShowPopup();
  updateChunkUI({
    currentChunkIndex: chunkIndex,
    totalChunks: totalChunks,
    index: 0,
    totalUrls: totalUrls,
  });
  for (let index = 0; index < totalUrls; index++) {
    try {
      console.log("Processing URL index", index + 1, "of", totalUrls);
      if (await isStopProcess()) {
        console.log("Process stopped by user during URL processing.");
        if (currentIndexElement) {
          currentIndexElement.textContent = "Process stopped by user.";
        }
        return;
      }
      updateChunkUI({
        currentChunkIndex: chunkIndex,
        totalChunks: totalChunks,
        index: index + 1,
        totalUrls: totalUrls,
      });
      await clickButton(["Yêu cầu mới", "New request"], 500);
      await urlToSubmissionBar(urlListTrimmed[index]);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await clickButton(["tiếp", "tiếp theo", "next"], 500);
      await clickButton(["Gửi yêu cầu", "Submit request"], 2000);
      await clickButton(["Đóng", "Close"], 500);

      doneUrls.push(urlListTrimmed[index]);
      await setLocalData({
        index: index + 1,
        lastUpdateTime: Date.now(),
        URLs: allUrls.filter((url) => !doneUrls.includes(url)).join("\n"),
      });
    } catch (error) {
      console.error("Error processing URL:", error);
    }
  }
  if (await isStopProcess()) {
    console.log("Process stopped by user during URL processing.");
    if (currentIndexElement) {
      currentIndexElement.textContent = "Process stopped by user.";
    }
    return;
  }
  if (chunkIndex >= totalChunks) {
    if (currentIndexElement) {
      currentIndexElement.textContent = "All chunks processed";
    }
    console.log("All chunks processed");
    await setLocalData({
      isProcessing: false,
      URLs: allUrls.filter((url) => !doneUrls.includes(url)).join("\n"),
    });
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  await linksResubmission(allUrls, doneUrls, chunkIndex + 1, chunkSize, tabId);
}

async function urlToSubmissionBar(url: string) {
  const urlInput = document.querySelector('.Ufn6O.PPB5Hf input[type="text"]');
  if (urlInput) {
    (urlInput as HTMLInputElement).value = url;
    const inputEvent = new Event("input", { bubbles: true });
    urlInput.dispatchEvent(inputEvent);
    console.log(`Entered URL: ${url}`);
  } else {
    throw new Error("URL input field not found");
  }
}
async function clickButton(
  text: string[],
  timer: number = 3000,
  selector: string = ".CwaK9 .RveJvd.snByac"
) {
  const button = Array.from(document.querySelectorAll(selector)).find(
    (button: any) => {
      const buttonText = button.textContent.trim().toLowerCase();
      for (const txt of text) {
        if (buttonText === txt.trim().toLocaleLowerCase()) {
          return true;
        }
      }
      return false;
    }
  );
  if (button) {
    const clickEvent = new Event("click", { bubbles: true });
    button.dispatchEvent(clickEvent);
  } else {
    console.log(text);
    console.log(" Button not found");
  }
  await new Promise((resolve) => setTimeout(resolve, timer));
}
function getMessage(key: string, ...args: any[]): string {
  const messages: any = {
    vi: {
      noValidUrls: "Vui lòng nhập ít nhất một URL hợp lệ.",
    },
    en: {
      noValidUrls: "Please insert at least one valid URL.",
    },
  };
  const lang = document.documentElement.lang.includes("vi") ? "vi" : "en";
  return messages[lang][key] || messages.en[key];
}
