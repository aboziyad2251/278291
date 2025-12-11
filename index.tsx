/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';
import { Chart } from 'chart.js/auto';
import { jsPDF } from 'jspdf';

const cvUpload = document.getElementById('cv-upload') as HTMLInputElement;
const cvUploadButton = document.getElementById(
  'cv-upload-button'
) as HTMLButtonElement;
const fileNameSpan = document.getElementById('file-name') as HTMLSpanElement;
const jobDescription = document.getElementById(
  'job-description'
) as HTMLTextAreaElement;
const analyzeButton = document.getElementById(
  'analyze-button'
) as HTMLButtonElement;
const resultsContainer = document.getElementById(
  'results-container'
) as HTMLDivElement;
const container = document.querySelector('.container') as HTMLDivElement;

let cvFile: {
  mimeType: string;
  data: string;
} | null = null;
let currentAnalysisData: any | null = null;
let keywordChart: Chart | null = null;
let jobFitChart: Chart | null = null;
let isViewOnly = false;

// --- Chart Theming ---
function getChartColors() {
  const style = getComputedStyle(document.body);
  return {
    textColor: style.getPropertyValue('--chart-text-color').trim(),
    gridColor: style.getPropertyValue('--chart-grid-color').trim(),
    doughnutSecondaryColor: style
      .getPropertyValue('--doughnut-secondary-color')
      .trim(),
  };
}

// --- Helper Functions ---

/**
 * Converts a File object to a base64 encoded string.
 */
function fileToGenerativePart(
  file: File
): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({
        mimeType: file.type,
        data: base64Data,
      });
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Checks if both inputs are valid and enables/disables the analyze button.
 */
function validateInputs() {
  const isJobDescriptionFilled = jobDescription.value.trim().length > 0;
  analyzeButton.disabled = !(cvFile && isJobDescriptionFilled);
}

/**
 * Renders a progress bar for scores.
 */
function createProgressBar(score: number): string {
  let colorClass = 'low';
  if (score >= 70) {
    colorClass = 'high';
  } else if (score >= 40) {
    colorClass = 'medium';
  }
  return `
    <div class="progress-bar-container">
      <div class="progress-bar ${colorClass}" style="width: ${score}%;">
        ${score}%
      </div>
    </div>
  `;
}

/**
 * Displays the analysis results in the UI, including charts.
 * @param data The parsed JSON data from the API.
 */
function renderResults(data: any) {
  // Destroy previous charts to prevent memory leaks and rendering issues
  if (keywordChart) {
    keywordChart.destroy();
    keywordChart = null;
  }
  if (jobFitChart) {
    jobFitChart.destroy();
    jobFitChart = null;
  }

  const { parsedCvData, keywordAnalysis, jobFit } = data;

  const refinedCvHtml = `
    <div class="result-section refined-cv-section">
      <h3>📄 Your Auto-Refined CV</h3>
      <p>This is a complete version of your CV with the AI's suggestions applied. Download it as a PDF or copy the text to start applying!</p>
      <div class="refined-cv-actions">
        <button id="copy-cv-button">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z"/></svg>
          <span>Copy CV Text</span>
        </button>
        <button id="download-cv-button">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
              <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
              <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
          </svg>
          <span>Download Refined CV (PDF)</span>
        </button>
      </div>
    </div>
  `;

  const trimmingSuggestionsHtml =
    jobFit.cvTrimmingSuggestions?.length > 0
      ? `
    <div class="result-section trimming-section">
      <h3>🗑️ CV Trimming & Condensing Suggestions</h3>
      <p>Consider removing or rephrasing the following to make your CV more focused on the job requirements.</p>
      ${jobFit.cvTrimmingSuggestions
        .map((item: any) => {
          const rephrasedHtml = item.rephrasedExample
            ? `
            <div class="rephrased-example">
                <strong>💡 Suggestion:</strong>
                <pre><code>${item.rephrasedExample}</code></pre>
            </div>`
            : '';

          return `
            <div class="trimming-item">
                <div class="trimming-content">
                    <pre><code>${item.textToRemove}</code></pre>
                </div>
                <p class="trimming-reason"><strong>Reasoning:</strong> ${item.reason}</p>
                ${rephrasedHtml}
            </div>`;
        })
        .join('')}
    </div>
    `
      : '';

  const suggestionsHtml =
    jobFit.suggestedCvImprovements?.length > 0
      ? `
    <div class="result-section suggestions-section">
      <h3>📝 Suggested CV Enhancements (to score >80%)</h3>
      <p>Copy and paste these suggestions into the relevant sections of your CV to improve keyword matching.</p>
      ${jobFit.suggestedCvImprovements
        .map(
          (item: any, index: number) => `
        <div class="suggestion-item">
          <h4>For your '${item.sectionToImprove}' section:</h4>
          <div class="suggestion-content">
            <pre><code>${item.suggestedText}</code></pre>
            <button class="copy-btn" data-suggestion-id="${index}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z"/></svg>
                <span>Copy</span>
            </button>
          </div>
        </div>`
        )
        .join('')}
    </div>`
      : '';

  const shareButtonHtml = !isViewOnly
    ? `
    <div class="share-container">
        <button id="share-button">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.499 2.499 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5"/>
            </svg>
            <span>Share Analysis</span>
        </button>
    </div>
  `
    : '';

  resultsContainer.innerHTML = `
    ${refinedCvHtml}
    ${shareButtonHtml}
    <div class="result-section">
      <h3>🧠 ATS Parsed CV Data</h3>
      <ul>
        <li><strong>Candidate Name:</strong> ${
          parsedCvData.candidateName || 'N/A'
        }</li>
        <li><strong>Contact Info:</strong> ${
          parsedCvData.contactInfo || 'N/A'
        }</li>
        <li><strong>Summary:</strong> ${parsedCvData.summary || 'N/A'}</li>
        <li><strong>Skills Extracted:</strong> ${
          parsedCvData.skillsExtracted?.join(', ') || 'N/A'
        }</li>
        <li><strong>Education:</strong> ${
          parsedCvData.education?.join('; ') || 'N/A'
        }</li>
        <li><strong>Experience:</strong> ${
          parsedCvData.experience?.join('; ') || 'N/A'
        }</li>
        <li><strong>Certifications:</strong> ${
          parsedCvData.certifications?.join(', ') || 'N/A'
        }</li>
      </ul>
    </div>
    <div class="result-section">
      <h3>📊 ATS Keyword Match Analysis</h3>
      <div class="chart-container">
        <canvas id="keyword-chart"></canvas>
      </div>
      <ul>
        <li>
          <strong>Overall ATS Match Score:</strong>
          ${createProgressBar(keywordAnalysis.matchScore)}
        </li>
         <li>
          <strong>Score Breakdown:</strong>
          <ul class="score-breakdown-list">
            <li>
              <span>Skills Match</span>
              ${createProgressBar(keywordAnalysis.scoreBreakdown.skillsScore)}
            </li>
            <li>
              <span>Experience Match</span>
              ${createProgressBar(
                keywordAnalysis.scoreBreakdown.experienceScore
              )}
            </li>
            <li>
              <span>Education Match</span>
              ${createProgressBar(keywordAnalysis.scoreBreakdown.educationScore)}
            </li>
          </ul>
        </li>
        <li>
          <strong>Matched Keywords:</strong>
          <div class="tooltip">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M5.496 6.033h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286a.237.237 0 0 0 .241.247m2.325 5.422c.534 0 .813-.246.813-.622 0-.376-.279-.623-.813-.623-.526 0-.813.247-.813.623 0 .376.287.622.813.622"/>
            </svg>
            <span class="tooltiptext">These are keywords found in both your CV and the job description. A higher number of matched keywords generally improves your score with automated screening systems.</span>
          </div>
          ${keywordAnalysis.matchedKeywords?.join(', ') || 'N/A'}
        </li>
        <li>
          <strong>Missing Keywords (recommended to add):</strong>
          <div class="tooltip">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M5.496 6.033h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286a.237.237 0 0 0 .241.247m2.325 5.422c.534 0 .813-.246.813-.622 0-.376-.279-.623-.813-.623-.526 0-.813.247-.813.623 0 .376.287.622.813.622"/>
            </svg>
            <span class="tooltiptext">These keywords are present in the job description but were not found in your CV. Strategically adding these (where relevant to your experience) can significantly boost your ATS match score.</span>
          </div>
          ${keywordAnalysis.missingKeywords?.join(', ') || 'N/A'}
        </li>
      </ul>
    </div>
    <div class="result-section">
      <h3>💼 Job Fit Evaluation</h3>
      <div class="chart-container" style="max-width: 300px;">
         <canvas id="job-fit-chart"></canvas>
      </div>
      <ul>
         <li>
          <strong>Estimated Hiring Probability:</strong>
          ${createProgressBar(jobFit.hiringProbability)}
        </li>
        <li>
          <strong>Top 3 Recommendations to Improve:</strong>
          <ol>
            ${jobFit.recommendations
              ?.map((rec: string) => `<li>${rec}</li>`)
              .join('')}
          </ol>
        </li>
      </ul>
    </div>
    ${trimmingSuggestionsHtml}
    ${suggestionsHtml}
  `;

  // --- Create Charts with Theme Colors ---
  const chartColors = getChartColors();

  const keywordCtx = document.getElementById(
    'keyword-chart'
  ) as HTMLCanvasElement;
  if (keywordCtx) {
    const matchedCount = keywordAnalysis.matchedKeywords?.length || 0;
    const missingCount = keywordAnalysis.missingKeywords?.length || 0;

    keywordChart = new Chart(keywordCtx, {
      type: 'bar',
      data: {
        labels: ['Keywords'],
        datasets: [
          {
            label: 'Matched',
            data: [matchedCount],
            backgroundColor: getComputedStyle(
              document.documentElement
            ).getPropertyValue('--success-color'),
            borderColor: getComputedStyle(
              document.documentElement
            ).getPropertyValue('--success-color'),
            borderWidth: 1,
          },
          {
            label: 'Missing',
            data: [missingCount],
            backgroundColor: getComputedStyle(
              document.documentElement
            ).getPropertyValue('--warning-color'),
            borderColor: getComputedStyle(
              document.documentElement
            ).getPropertyValue('--warning-color'),
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Matched vs. Missing Keywords Count',
            color: chartColors.textColor,
          },
          legend: {
            position: 'bottom',
            labels: {
              color: chartColors.textColor,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              precision: 0, // ensure whole numbers on the axis
              color: chartColors.textColor,
            },
            grid: {
              color: chartColors.gridColor,
            },
          },
          y: {
            grid: {
              display: false,
            },
            ticks: {
              color: chartColors.textColor,
            },
          },
        },
      },
    });
  }

  const jobFitCtx = document.getElementById(
    'job-fit-chart'
  ) as HTMLCanvasElement;
  if (jobFitCtx) {
    const relevance = jobFit.relevance || 'N/A';
    let relevanceValue = 0;
    let relevanceColor = '#6c757d'; // default color

    switch (relevance.toLowerCase()) {
      case 'high':
        relevanceValue = 85;
        relevanceColor = getComputedStyle(
          document.documentElement
        ).getPropertyValue('--success-color');
        break;
      case 'medium':
        relevanceValue = 50;
        relevanceColor = getComputedStyle(
          document.documentElement
        ).getPropertyValue('--warning-color');
        break;
      case 'low':
        relevanceValue = 15;
        relevanceColor = getComputedStyle(
          document.documentElement
        ).getPropertyValue('--danger-color');
        break;
    }

    const gaugeText = {
      id: 'gaugeText',
      beforeDatasetsDraw(chart: Chart) {
        const { ctx } = chart;
        ctx.save();
        const x = chart.getDatasetMeta(0).data[0].x;
        const y = chart.getDatasetMeta(0).data[0].y;

        ctx.font = `bold 24px ${getComputedStyle(document.body).fontFamily}`;
        ctx.fillStyle = relevanceColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(relevance, x, y - 10);

        ctx.font = `16px ${getComputedStyle(document.body).fontFamily}`;
        ctx.fillStyle = getComputedStyle(
          document.documentElement
        ).getPropertyValue('--secondary-text-color');
        ctx.fillText('Relevance', x, y + 15);
        ctx.restore();
      },
    };

    jobFitChart = new Chart(jobFitCtx, {
      type: 'doughnut',
      data: {
        labels: [relevance],
        datasets: [
          {
            data: [relevanceValue, 100 - relevanceValue],
            backgroundColor: [
              relevanceColor,
              chartColors.doughnutSecondaryColor,
            ],
            borderColor: [relevanceColor, chartColors.doughnutSecondaryColor],
            borderWidth: 1,
            circumference: 180,
            rotation: -90,
            cutout: '80%',
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          title: {
            display: true,
            text: 'Job Description Relevance',
            color: chartColors.textColor,
          },
        },
      },
      plugins: [gaugeText],
    });
  }
}

/**
 * Shows a loading spinner in the results container.
 */
function showLoading() {
  resultsContainer.innerHTML = `
    <div class="loader-container">
      <div class="loader"></div>
      <p>Analyzing... This may take a moment.</p>
    </div>
  `;
}

/**
 * Shows an error message in the results container.
 */
function showError(message: string, title = 'Analysis Failed') {
  resultsContainer.innerHTML = `
    <div class="error-message">
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
  `;
}

/**
 * Parses an API error and returns a user-friendly message.
 */
function getApiErrorMessage(error: any): string {
  console.error('API Error Details:', error); // Full error for devs

  // Default message
  let message =
    'An unexpected error occurred. Please check the developer console for details and try again later.';

  if (error && typeof error.message === 'string') {
    const errorMessage = error.message.toLowerCase();
    if (
      errorMessage.includes('api key not valid') ||
      errorMessage.includes('invalid api key')
    ) {
      message =
        'API Key is invalid or missing. Please ensure it is configured correctly in your environment.';
    } else if (errorMessage.includes('rate limit exceeded')) {
      message =
        'You have exceeded your request limit for the API. Please wait a while before trying again.';
    } else if (
      errorMessage.includes('404') ||
      errorMessage.includes('model not found')
    ) {
      message =
        'The requested AI model could not be found. This might be a configuration issue.';
    } else if (
      errorMessage.includes('unsupported mime type') ||
      errorMessage.includes('400') ||
      errorMessage.includes('bad request')
    ) {
      message =
        'There was a problem with the request, possibly due to an unsupported file format (only PDF is supported) or invalid content. Please try a different file.';
    } else if (
      errorMessage.includes('500') ||
      errorMessage.includes('internal error')
    ) {
      message =
        'The AI model encountered an internal server error. This is likely a temporary issue. Please try again in a few moments.';
    } else {
      // Use the error message directly if it's not one of the common cases
      message = error.message;
    }
  }
  return message;
}

// --- Event Listeners ---

resultsContainer.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const copyButton = target.closest('.copy-btn');
  const shareButton = target.closest('#share-button') as HTMLButtonElement;
  const downloadButton = target.closest(
    '#download-cv-button'
  ) as HTMLButtonElement;
  const copyCvButton = target.closest('#copy-cv-button') as HTMLButtonElement;

  if (copyButton && currentAnalysisData) {
    const suggestionId = parseInt(
      copyButton.getAttribute('data-suggestion-id')!,
      10
    );
    const suggestionText =
      currentAnalysisData.jobFit.suggestedCvImprovements[suggestionId]
        ?.suggestedText;

    if (suggestionText) {
      navigator.clipboard.writeText(suggestionText).then(
        () => {
          const buttonTextSpan = copyButton.querySelector('span');
          if (buttonTextSpan) {
            buttonTextSpan.textContent = 'Copied!';
            copyButton.classList.add('copied');
            setTimeout(() => {
              if (buttonTextSpan) {
                buttonTextSpan.textContent = 'Copy';
              }
              copyButton.classList.remove('copied');
            }, 2000);
          }
        },
        (err) => {
          console.error('Failed to copy text: ', err);
          alert('Failed to copy text.');
        }
      );
    }
  }

  if (shareButton && !isViewOnly) {
    const analysisId =
      'analysis-' +
      Date.now() +
      '-' +
      Math.random().toString(36).substring(2, 7);
    try {
      localStorage.setItem(analysisId, JSON.stringify(currentAnalysisData));
      const url = new URL(window.location.href);
      url.search = `?analysisId=${analysisId}`;
      const shareUrl = url.toString();

      navigator.clipboard.writeText(shareUrl).then(
        () => {
          const span = shareButton.querySelector('span');
          if (span) {
            span.textContent = 'Link Copied!';
          }
          shareButton.disabled = true;
          setTimeout(() => {
            if (span) {
              span.textContent = 'Share Analysis';
            }
            shareButton.disabled = false;
          }, 2500);
        },
        (err) => {
          console.error('Failed to copy share link: ', err);
          alert('Failed to copy share link.');
        }
      );
    } catch (e) {
      console.error('Failed to save analysis to localStorage:', e);
      alert(
        'Could not save analysis for sharing. LocalStorage might be full or disabled.'
      );
    }
  }

  if (downloadButton && currentAnalysisData) {
    try {
      const doc = new jsPDF();
      const refinedText = currentAnalysisData.refinedCvText;

      const margin = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const lines = doc.splitTextToSize(refinedText, pageWidth - margin * 2);

      doc.text(lines, margin, margin);
      doc.save('Refined_CV.pdf');
    } catch (e) {
      console.error('Failed to generate PDF:', e);
      alert('Sorry, there was an error generating the PDF.');
    }
  }

  if (copyCvButton && currentAnalysisData) {
    const refinedText = currentAnalysisData.refinedCvText;
    if (refinedText) {
      navigator.clipboard.writeText(refinedText).then(
        () => {
          const buttonTextSpan = copyCvButton.querySelector('span');
          if (buttonTextSpan) {
            buttonTextSpan.textContent = 'Copied!';
            copyCvButton.classList.add('copied');
            copyCvButton.disabled = true;
            setTimeout(() => {
              if (buttonTextSpan) {
                buttonTextSpan.textContent = 'Copy CV Text';
              }
              copyCvButton.classList.remove('copied');
              copyCvButton.disabled = false;
            }, 2000);
          }
        },
        (err) => {
          console.error('Failed to copy CV text: ', err);
          alert('Failed to copy CV text.');
        }
      );
    }
  }
});

// --- App Initialization ---

function initializeInteractiveApp() {
  isViewOnly = false;
  const loadSampleButton = document.getElementById(
    'load-sample-button'
  ) as HTMLButtonElement;

  // --- Sample Data ---
  const SAMPLE_JOB_DESCRIPTION = `Senior Frontend Engineer

We are looking for a skilled Frontend Engineer with experience in React, TypeScript, and modern JavaScript. The ideal candidate will have a strong understanding of web performance and building user-friendly interfaces.

Responsibilities:
- Develop and maintain web applications using React.
- Collaborate with designers and backend engineers.
- Write clean, maintainable, and testable code.

Requirements:
- 3+ years of experience with React.
- Proficiency in HTML, CSS, and JavaScript.
- Experience with state management libraries like Redux or Zustand.
- Familiarity with RESTful APIs.`;

  const SAMPLE_CV = {
    mimeType: 'application/pdf', // Using a valid MIME type for sample data
    data: 'Sm9obiBEb2UKam9obi5kb2VAZW1haWwuY29tIHwgKDEyMykgNDU2LTc4OTAgfCBsaW5rZWRpbi5jb20vaW4vam9obmRvZQoKU3VtbWFyeQpFeHBlcmllbmNlZCBTb2Z0d2FyZSBFbmdpbmVlciB3aXRoIGEgcGFzc2lvbiBmb3IgY3JlYXRpbmcgaW50dWl0aXZlIGFuZCBwZXJmb3JtYW50IHVzZXIgaW50ZXJmYWNlcy4gUHJvZmljaWVudCBpbiBKYXZhU2NyaXB0LCBSZWFjdCwgYW5kIE5vZGUuanMuCgpTa2lsbHMKLSBQcm9ncmFtbWluZyBMYW5ndWFnZXM6IEphdmFTY3JpcHQsIFR5cGVTY3JpcHQsIFB5dGhvbGotIEZyb250ZW5kOiBSZWFjdCwgUmVkdXgsIEhUTUw1LCBDU1MzLCBXZWJwYWNrCi0gQmFja2VuZDogTm9kZS5qcywgRXhwcmVzcwotIERhdGFiYXNlczogTW9uZ29EQiwgUG9zdGdyZVNRTAotIFRvb2xzOiBHaXQsIERvY2tlciwgSmVzdAoKRXhwZXJpZW5jZQpTb2Z0d2FyZSBFbmdpbmVlciB8IFRlY2ggU29sdXRpb25zIEluYy4gfCBBbnl0b3duLCBVU0EgfCBKYW4gMjAyMCAtIFByZXNlbnQKLSBMZWQgdGhlIGRldmVsb3BtZW50IG9mIGEgbmV3IGN1c3RvbWVyLWZhY2luZyBkYXNoYm9hcmQgdXNpbmcgUmVhY3QgYW5kIFR5cGVTY3JpcHQsIHJlc3VsdGluZyBpbiBhIDIwJSBpbmNyZWFzZSBpbiB1c2VyIGVuZ2FnZW1lbnQuCi0gQ29sbGFib3JhdGVkIHdpdGggYSB0ZWFtIG9mIDUgZW5naW5lZXJzIHRvIGJ1aWxkIGFuZCBtYWludGFpbiBhIGxhcmdlLXNjYWxlIHNpbmdsZS1wYWdlIGFwcGxpY2F0aW9uLgotIE9wdGltaXplZCBhcHBsaWNhdGlvbiBwZXJmb3JtYW5jZSBieSAzMCUgdGhyb3VnaCBjb2RlIHNwbGl0dGluZyBhbmQgbGF6eSBsb2FkaW5nLgoKRWR1Y2F0aW9uCkJhY2hlbG9yIG9mIFNjaWVuY2UgaW4gQ29tcHV0ZXIgU2NpZW5jZQpVbml2ZXJzaXR5IG9mIEV4YW1wbGUsIEV4YW1wbGV0b24sIFVTQSB8IDIwMTYgLSAyMDIw',
  };

  loadSampleButton.addEventListener('click', () => {
    jobDescription.value = SAMPLE_JOB_DESCRIPTION;
    cvFile = SAMPLE_CV;
    fileNameSpan.textContent = 'sample_cv.pdf';
    fileNameSpan.classList.add('selected');
    fileNameSpan.classList.remove('error');
    validateInputs();
  });

  cvUploadButton.addEventListener('click', () => {
    cvUpload.click();
  });

  cvUpload.addEventListener('change', async () => {
    const file = cvUpload.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        fileNameSpan.textContent = 'Error: Only PDF files are accepted.';
        fileNameSpan.classList.add('error');
        fileNameSpan.classList.remove('selected');
        cvUpload.value = ''; // Reset input
        cvFile = null;
        validateInputs();
        return;
      }
      fileNameSpan.classList.remove('error');
      fileNameSpan.textContent = file.name;
      fileNameSpan.classList.add('selected');
      try {
        cvFile = await fileToGenerativePart(file);
      } catch (err) {
        console.error('Error reading file:', err);
        cvFile = null;
        fileNameSpan.textContent = 'Error reading file';
        fileNameSpan.classList.add('error');
        fileNameSpan.classList.remove('selected');
      }
    } else {
      fileNameSpan.textContent = 'No file chosen';
      fileNameSpan.classList.remove('selected', 'error');
      cvFile = null;
    }
    validateInputs();
  });

  jobDescription.addEventListener('input', validateInputs);

  analyzeButton.addEventListener('click', async () => {
    if (!cvFile || !jobDescription.value) return;

    showLoading();
    analyzeButton.disabled = true;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            parts: [
              {
                text: `
                  You are an advanced ATS (Applicant Tracking System) simulator and an expert CV and resume designer.
                  Your task is to:
                  1. Parse and analyze the uploaded CV.
                  2. Compare the CV with the provided job description.
                  3. Show the CV data in an ATS-style format.
                  4. Evaluate compatibility, find missing keywords, and estimate hiring probability. Provide an overall match score (0-100) and also break this score down into sub-scores (0-100) for Skills, Experience, and Education.
                  5. Provide top 3 actionable recommendations for the candidate to improve their CV for this specific job.
                  6. CRITICAL: Generate concrete, copy-paste ready text suggestions for the candidate to add to their CV to increase their match score to above 80%. These suggestions must incorporate the missing keywords and skills you identified. Frame these suggestions as structured, professional sentences or bullet points that can be directly inserted under specific roles in the 'Experience' section or added to the 'Skills'/'Competencies' section. For each suggestion, specify the exact CV section it belongs to (e.g., 'Summary', 'Skills', or a specific job title under 'Experience').
                  7. Identify content to *remove* or *condense* from the CV. This includes irrelevant skills, experiences, or verbose details that detract from the candidate's suitability for this specific role. For each suggestion, provide the text to remove/condense, a concise reason, and where applicable, provide a concrete example of how to rephrase or condense the information.
                  8. Finally, after all the above analysis, generate a complete, refined, and professional version of the CV for the 'refinedCvText' field. This version should be well-formatted, clean, organized, and easy to read. It must seamlessly incorporate all your suggestions: add the new text, remove the unnecessary parts, and rephrase where you suggested. When generating this refined CV, adhere to the following professional resume design principles:
                      - **Structure & Layout:** Use a consistent structure with clear section headings (e.g., Profile, Experience, Education, Skills).
                      - **Content Integrity:** Keep all factual details from the original CV.
                      - **Clarity & Tone:** Improve clarity, grammar, and professional tone throughout.
                      - **Achievement-Oriented:** Highlight achievements using action verbs and measurable results where possible.
                      - **Conciseness:** Remove redundant or repetitive information.
                      - **Formatting:** Ensure consistent spacing, alignment, and use of bullet points for job duties. Avoid decorative symbols or extra blank lines. The output must be a single block of formatted plain text ready to be copied.

                  This is the job description:
                  ---
                  ${jobDescription.value}
                  ---
                `,
              },
              {
                inlineData: cvFile,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              refinedCvText: {
                type: Type.STRING,
                description:
                  'The full, refined text of the CV, incorporating all suggestions.',
              },
              parsedCvData: {
                type: Type.OBJECT,
                properties: {
                  candidateName: { type: Type.STRING },
                  contactInfo: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  skillsExtracted: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  education: { type: Type.ARRAY, items: { type: Type.STRING } },
                  experience: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  certifications: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
              },
              keywordAnalysis: {
                type: Type.OBJECT,
                properties: {
                  matchedKeywords: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  missingKeywords: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  matchScore: { type: Type.INTEGER },
                  scoreBreakdown: {
                    type: Type.OBJECT,
                    description: 'Granular scores for different CV sections.',
                    properties: {
                      skillsScore: {
                        type: Type.INTEGER,
                        description: 'Score for skills match (0-100).',
                      },
                      experienceScore: {
                        type: Type.INTEGER,
                        description: 'Score for experience match (0-100).',
                      },
                      educationScore: {
                        type: Type.INTEGER,
                        description: 'Score for education match (0-100).',
                      },
                    },
                    required: [
                      'skillsScore',
                      'experienceScore',
                      'educationScore',
                    ],
                  },
                },
              },
              jobFit: {
                type: Type.OBJECT,
                properties: {
                  relevance: {
                    type: Type.STRING,
                    description: "Must be 'High', 'Medium', or 'Low'.",
                  },
                  hiringProbability: { type: Type.INTEGER },
                  recommendations: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  suggestedCvImprovements: {
                    type: Type.ARRAY,
                    description: 'Concrete text suggestions to add to the CV.',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        sectionToImprove: {
                          type: Type.STRING,
                          description:
                            "The CV section to add the text to (e.g., 'Summary', 'Skills').",
                        },
                        suggestedText: {
                          type: Type.STRING,
                          description:
                            'The specific text to be copied and pasted into the CV.',
                        },
                      },
                      required: ['sectionToImprove', 'suggestedText'],
                    },
                  },
                  cvTrimmingSuggestions: {
                    type: Type.ARRAY,
                    description:
                      'Suggestions for content to remove or condense from the CV to improve focus.',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        textToRemove: {
                          type: Type.STRING,
                          description:
                            'The specific text or a summary of content suggested for removal/condensing.',
                        },
                        reason: {
                          type: Type.STRING,
                          description:
                            'The justification for why this content should be removed or condensed.',
                        },
                        rephrasedExample: {
                          type: Type.STRING,
                          description:
                            'An optional example of how to rephrase or condense the text.',
                        },
                      },
                      required: ['textToRemove', 'reason'],
                    },
                  },
                },
              },
            },
            required: [
              'refinedCvText',
              'parsedCvData',
              'keywordAnalysis',
              'jobFit',
            ],
          },
        },
      });

      const data = JSON.parse(response.text);
      currentAnalysisData = data;
      renderResults(data);
    } catch (error) {
      const friendlyErrorMessage = getApiErrorMessage(error);
      showError(friendlyErrorMessage, 'Analysis Failed');
    } finally {
      validateInputs(); // Re-enable button if inputs are still valid
    }
  });
}

function loadSharedAnalysis(analysisId: string) {
  isViewOnly = true;
  container.classList.add('view-only');
  const inputCard = document.getElementById('input-card');
  if (inputCard) inputCard.classList.add('hidden');

  try {
    const storedData = localStorage.getItem(analysisId);
    if (storedData) {
      const data = JSON.parse(storedData);
      currentAnalysisData = data; // Make data available for copy/download buttons
      renderResults(data);
    } else {
      showError(
        'The requested analysis could not be found. It may have expired or the link is incorrect.',
        'Analysis Not Found'
      );
    }
  } catch (e) {
    console.error('Error loading shared analysis:', e);
    showError(
      'There was an error loading the shared analysis data. It may be corrupted.',
      'Load Error'
    );
  }
}

// --- Theme Management ---
function applyTheme(themeName: string) {
  // Clear any existing theme classes
  document.body.classList.forEach((className) => {
    if (className.startsWith('theme-')) {
      document.body.classList.remove(className);
    }
  });

  // Add the new theme class
  document.body.classList.add(`theme-${themeName}`);

  // Update active state on buttons
  const themeButtons = document.querySelectorAll('.theme-button');
  themeButtons.forEach((button) => {
    if (button.getAttribute('data-theme') === themeName) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });

  // Save the theme to local storage
  localStorage.setItem('theme', themeName);

  // Re-render charts if analysis data exists to apply new theme colors
  if (currentAnalysisData) {
    renderResults(currentAnalysisData);
  }
}

function initializeTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light-default';
  applyTheme(savedTheme);

  const themeButtons = document.querySelectorAll('.theme-button');
  themeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const themeName = button.getAttribute('data-theme');
      if (themeName) {
        applyTheme(themeName);
      }
    });
  });
}

// --- Main Entry Point ---
initializeTheme();

const params = new URLSearchParams(window.location.search);
const analysisId = params.get('analysisId');

if (analysisId) {
  loadSharedAnalysis(analysisId);
} else {
  initializeInteractiveApp();
}
