import React, { useState, useRef, useMemo } from 'react';
import { Upload, FileText, X, ChevronRight, FileUp, CheckCircle2, Loader2, Download, ArrowLeft, BarChart3, Info, Lightbulb, ArrowUpDown, ArrowUp, ArrowDown, MessageSquare, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from '@google/genai';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface AssessmentRow {
  Description: string;
  Keywords: string;
  Source: string;
  Assessment: string;
}

interface AssessmentSections {
  generalDetails: AssessmentRow[];
  leaseScopeIdentify: AssessmentRow[];
  leaseTermAssessment: AssessmentRow[];
  rouAndLiabilityAssessment: AssessmentRow[];
}

interface AccountingStatement {
  initialROUAsset: number;
  initialLeaseLiability: number;
  monthlyDepreciation: number;
  notes: string;
}

interface CostBreakdown {
  fixedPayments: number;
  nonLeaseComponents: number;
  otherCosts: number;
}

interface AssessmentSummary {
  psakType: string;
  isPSAK116: boolean;
  leaseTermMonths: number;
  paymentTiming: string;
  identifiedAsset: string;
  fixedLeasePayment: number;
  currency: string;
  isLease: boolean;
  accountingStatement: AccountingStatement | null;
  contractType: string;
  termBeginDate: string;
  termEndDate: string;
  termPeriodType: string;
  exerciseTerminationOptions: string;
  nonLeaseComponent: string;
  practicalExpedient: string;
  importantMessages: string[];
  costBreakdown: CostBreakdown | null;
  benchmarkComparison: string | null;
}

interface AssessmentData {
  sections: AssessmentSections | null;
  summary: AssessmentSummary;
  insights: string[];
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [base64File, setBase64File] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [assessmentData, setAssessmentData] = useState<AssessmentData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  type SortField = 'Description' | 'Keywords' | 'Source' | 'Assessment' | null;
  type SortDirection = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [activeTab, setActiveTab] = useState<'generalDetails' | 'leaseScopeIdentify' | 'leaseTermAssessment' | 'rouAndLiabilityAssessment'>('generalDetails');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = async (selectedFile: File) => {
    if (selectedFile.type === 'application/pdf' || selectedFile.name.endsWith('.pdf')) {
      setFile(selectedFile);
      setAssessmentData(null);
      await analyzeContract(selectedFile);
    } else {
      alert('Please upload a PDF file.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const removeFile = () => {
    setFile(null);
    setAssessmentData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Remove the data:application/pdf;base64, prefix
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const analyzeContract = async (fileToAnalyze: File) => {
    setIsAnalyzing(true);
    setAssessmentData(null);

    try {
      const base64Data = await fileToBase64(fileToAnalyze);
      setBase64File(base64Data);
      setChatMessages([{
        role: 'model',
        text: 'Halo! Saya asisten AI Anda untuk dokumen ini. Ada yang ingin ditanyakan atau dikoreksi mengenai hasil asesmen kontrak ini?'
      }]);

      const prompt = `You are a legal and accounting expert specializing in PSAK 116 (IFRS 16) Lease Accounting in Indonesia.
Read the whole lease contract document first and determine what type of PSAK this contract falls under.
- If it IS PSAK 116, then continue the assessment.
- If NOT, mention what type of PSAK it is in the summary, but do NOT generate the sections (set 'sections' to null).

The output MUST be in JSON format, representing an object with three keys: 'sections', 'summary', and 'insights'.

'sections' should be an object with 4 keys: 'generalDetails', 'leaseScopeIdentify', 'leaseTermAssessment', 'rouAndLiabilityAssessment'.
Each key contains an array of objects representing rows. Each row has 4 keys:
1. 'Description': The English description.
2. 'Keywords': The Bahasa Indonesia keywords.
3. 'Source': Either 'Available in Contract' or 'Management Manual Input'.
4. 'Assessment': The detailed assessment in Bahasa Indonesia. IF the Source is 'Management Manual Input', DO NOT fill the assessment in (leave it as an empty string or 'Perlu Input Manajemen'). Otherwise, explain where you base the assessment from, refer to specific parts/clauses in the contract that support the assessment, not just a simple yes or no. Make it very detailed.

Section 1: General Details
- Contract number of reference
- Lessee name
- Lessor name
- Is the contract a contract modification or amendment?

Section 2: PSAK 116 : Lease Scope Identify
- Identified Asset
- Customer has the right to substantially all the economic benefits throughout the period of contract
- Right to control use of identified asset throughout the period of contract (direct how and for what purpose)
- Customer Operate the asset or designed the asset
- Not considered as a contract with short term period without (expected) extension
- Decision to exercise whether short-term lease will be treated as lease (Source: Management Manual Input)
- Not considered as low value assets (Source: Management Manual Input)
- Decision to exercise whether low value assets will be treated as lease (Source: Management Manual Input)
- Contact contains lease (yes/no)

Section 3: Lease Term Assessment
A. Lease Term:
- Lease commencement date (and lease inception date, if different)
- Non cancellable period
- Period(s) covered by extension option (whether or not included in the determined lease term) and details of option holder
- Decision to exercise the extension option (Source: Management Manual Input)
- Period(s) covered by termination option (whether or not included in the determined lease term) and details of option holder
- Decision to exercise the termination option (Source: Management Manual Input)
- Determined lease term of the contract

Section 4: ROU & Liability Assessment
B. ROU & Lease Liability (Make sure the numbers are correct)
- Fixed lease payments (based on the BASE Contract not the invoices)
- Timing of payment
- Variable lease payments that depend on an index or rate
- Amounts expected to be payable under residual value guarantees
- Purchase option
- Decision to exercise the purchase option (Source: Management Manual Input)
- Penalties for lease termination, if determined lease term reflects the entity exercising a termination option (Source: Management Manual Input)
- Cost elements other than lease liability (e.g. lease payments made at or before commencement less any lease incentives, initial direct costs, dismantling/removal/restoration costs) determined to be appropriately recognized and agreed to supporting documentation (Y/N and details of nature of cost elements)
- Management estimation of the cost elements other than lease liability (Source: Management Manual Input)
- Non lease components (List down the exact numbers/fee that is mentioned in the contract)
- Decision to include/exclude non lease component in the lease calculation (Source: Management Manual Input)
- Discount rate used in present value calculation (Source: Management Manual Input)

'summary' should be an object containing key metrics:
- 'psakType': (string) The determined PSAK type (e.g., "PSAK 116", "PSAK 72").
- 'isPSAK116': (boolean) True if it falls under PSAK 116.
- 'leaseTermMonths': (number) The total lease term in months. If not found, use 0.
- 'paymentTiming': (string) e.g., "Monthly", "Quarterly", "Annually". If not found, use "Unknown".
- 'identifiedAsset': (string) A short description of the leased asset. If not found, use "Unknown".
- 'fixedLeasePayment': (number) The amount of the fixed lease payment per period. If not found, use 0.
- 'currency': (string) The currency of the payment (e.g., "IDR", "USD"). If not found, use "IDR".
- 'isLease': (boolean) True if the contract contains a lease under PSAK 116, false otherwise.
- 'accountingStatement': an object with 'initialROUAsset' (number), 'initialLeaseLiability' (number), 'monthlyDepreciation' (number), 'notes' (string explaining what is needed to calculate exact numbers if discount rate is missing, or assumptions made). If not PSAK 116, this can be null.
- 'contractType': (string) "New Contract" or "Amendment".
- 'termBeginDate': (string) The begin date of the lease term.
- 'termEndDate': (string) The end date of the lease term.
- 'termPeriodType': (string) "Long Term" or "Short Term".
- 'exerciseTerminationOptions': (string) e.g., "Yes", "No", or "N/A".
- 'nonLeaseComponent': (string) e.g., "Combined", "Separated", or "None".
- 'practicalExpedient': (string) e.g., "Used" or "Not Used".
- 'importantMessages': (array of strings) Any other important messages or clauses in the contract.
- 'costBreakdown': an object with 'fixedPayments' (number), 'nonLeaseComponents' (number), 'otherCosts' (number). If not available, use 0 for each.
- 'benchmarkComparison': (string) A brief comparison of this contract's terms (e.g., lease term, payment amount) against typical industry benchmarks for this type of asset in Indonesia.

'insights' should be an array of strings in Bahasa Indonesia. Each string should be a key insight, observation, potential risk, area of opportunity, or best practice derived from the contract's terms based on the assessment. Provide 3-5 valuable insights.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data,
            },
          },
          prompt,
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sections: {
                type: Type.OBJECT,
                nullable: true,
                properties: {
                  generalDetails: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        Description: { type: Type.STRING },
                        Keywords: { type: Type.STRING },
                        Source: { type: Type.STRING },
                        Assessment: { type: Type.STRING },
                      },
                      required: ['Description', 'Keywords', 'Source', 'Assessment'],
                    },
                  },
                  leaseScopeIdentify: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        Description: { type: Type.STRING },
                        Keywords: { type: Type.STRING },
                        Source: { type: Type.STRING },
                        Assessment: { type: Type.STRING },
                      },
                      required: ['Description', 'Keywords', 'Source', 'Assessment'],
                    },
                  },
                  leaseTermAssessment: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        Description: { type: Type.STRING },
                        Keywords: { type: Type.STRING },
                        Source: { type: Type.STRING },
                        Assessment: { type: Type.STRING },
                      },
                      required: ['Description', 'Keywords', 'Source', 'Assessment'],
                    },
                  },
                  rouAndLiabilityAssessment: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        Description: { type: Type.STRING },
                        Keywords: { type: Type.STRING },
                        Source: { type: Type.STRING },
                        Assessment: { type: Type.STRING },
                      },
                      required: ['Description', 'Keywords', 'Source', 'Assessment'],
                    },
                  },
                },
                required: ['generalDetails', 'leaseScopeIdentify', 'leaseTermAssessment', 'rouAndLiabilityAssessment'],
              },
              summary: {
                type: Type.OBJECT,
                properties: {
                  psakType: { type: Type.STRING },
                  isPSAK116: { type: Type.BOOLEAN },
                  leaseTermMonths: { type: Type.NUMBER },
                  paymentTiming: { type: Type.STRING },
                  identifiedAsset: { type: Type.STRING },
                  fixedLeasePayment: { type: Type.NUMBER },
                  currency: { type: Type.STRING },
                  isLease: { type: Type.BOOLEAN },
                  accountingStatement: {
                    type: Type.OBJECT,
                    nullable: true,
                    properties: {
                      initialROUAsset: { type: Type.NUMBER },
                      initialLeaseLiability: { type: Type.NUMBER },
                      monthlyDepreciation: { type: Type.NUMBER },
                      notes: { type: Type.STRING },
                    },
                    required: ['initialROUAsset', 'initialLeaseLiability', 'monthlyDepreciation', 'notes'],
                  },
                  contractType: { type: Type.STRING },
                  termBeginDate: { type: Type.STRING },
                  termEndDate: { type: Type.STRING },
                  termPeriodType: { type: Type.STRING },
                  exerciseTerminationOptions: { type: Type.STRING },
                  nonLeaseComponent: { type: Type.STRING },
                  practicalExpedient: { type: Type.STRING },
                  importantMessages: { type: Type.ARRAY, items: { type: Type.STRING } },
                  costBreakdown: {
                    type: Type.OBJECT,
                    nullable: true,
                    properties: {
                      fixedPayments: { type: Type.NUMBER },
                      nonLeaseComponents: { type: Type.NUMBER },
                      otherCosts: { type: Type.NUMBER },
                    },
                    required: ['fixedPayments', 'nonLeaseComponents', 'otherCosts'],
                  },
                  benchmarkComparison: { type: Type.STRING, nullable: true },
                },
                required: ['psakType', 'isPSAK116', 'leaseTermMonths', 'paymentTiming', 'identifiedAsset', 'fixedLeasePayment', 'currency', 'isLease', 'contractType', 'termBeginDate', 'termEndDate', 'termPeriodType', 'exerciseTerminationOptions', 'nonLeaseComponent', 'practicalExpedient', 'importantMessages'],
              },
              insights: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Key insights, risks, or observations derived from the contract.",
              }
            },
            required: ['summary', 'insights'],
          },
        },
      });

      const jsonText = response.text;
      if (!jsonText) throw new Error('No response from AI');

      const data = JSON.parse(jsonText);
      setAssessmentData(data);
      
    } catch (error) {
      console.error('Error analyzing contract:', error);
      alert('An error occurred while analyzing the contract. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadExcel = () => {
    if (!assessmentData || !file) return;
    
    const workbook = XLSX.utils.book_new();
    const wscols = [
      { wch: 40 }, // Description
      { wch: 40 }, // Keywords
      { wch: 30 }, // Source
      { wch: 100 }, // Assessment
    ];

    if (assessmentData.sections) {
      const sheets = [
        { name: '1. General Details', data: assessmentData.sections.generalDetails },
        { name: '2. PSAK 116 Lease Scope', data: assessmentData.sections.leaseScopeIdentify },
        { name: '3. Lease Term Assessment', data: assessmentData.sections.leaseTermAssessment },
        { name: '4. ROU & Liability', data: assessmentData.sections.rouAndLiabilityAssessment },
      ];

      sheets.forEach(sheet => {
        const worksheet = XLSX.utils.json_to_sheet(sheet.data);
        worksheet['!cols'] = wscols;
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      });
    } else {
      const worksheet = XLSX.utils.json_to_sheet([{ Note: `Contract does not fall under PSAK 116. It is identified as ${assessmentData.summary.psakType}.` }]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Assessment');
    }

    // Download file
    XLSX.writeFile(workbook, `PSAK_116_Assessment_${file.name.replace('.pdf', '')}.xlsx`);
  };

  const generateChartData = (summary: AssessmentSummary) => {
    const data = [];
    const periods = summary.leaseTermMonths;
    const payment = summary.fixedLeasePayment;
    
    if (periods === 0 || payment === 0) return [];
    
    // If we have a lot of months, group by year
    if (periods > 24) {
      const years = Math.ceil(periods / 12);
      for (let i = 1; i <= years; i++) {
        // Calculate how many months in this year
        const monthsInYear = i === years ? (periods % 12 || 12) : 12;
        // Calculate payment for this year based on timing
        let multiplier = 1;
        if (summary.paymentTiming.toLowerCase().includes('month')) multiplier = monthsInYear;
        else if (summary.paymentTiming.toLowerCase().includes('quarter')) multiplier = Math.ceil(monthsInYear / 3);
        else if (summary.paymentTiming.toLowerCase().includes('annual') || summary.paymentTiming.toLowerCase().includes('year')) multiplier = i === years ? Math.ceil(monthsInYear / 12) : 1;
        
        data.push({
          period: `Year ${i}`,
          amount: payment * multiplier
        });
      }
    } else {
      // Show by month/period
      let step = 1;
      let labelPrefix = 'Month';
      if (summary.paymentTiming.toLowerCase().includes('quarter')) { step = 3; labelPrefix = 'Q'; }
      else if (summary.paymentTiming.toLowerCase().includes('annual') || summary.paymentTiming.toLowerCase().includes('year')) { step = 12; labelPrefix = 'Year'; }
      
      let periodCount = 1;
      for (let i = 1; i <= periods; i += step) {
        data.push({
          period: `${labelPrefix} ${periodCount++}`,
          amount: payment
        });
      }
    }
    return data;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedTableData = useMemo(() => {
    if (!assessmentData?.sections) return [];
    const currentTable = assessmentData.sections[activeTab];
    if (!sortField) return currentTable;

    return [...currentTable].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [assessmentData?.sections, activeTab, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-4 h-4 text-indigo-600" /> : <ArrowDown className="w-4 h-4 text-indigo-600" />;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !base64File || isChatting) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsChatting(true);

    // Scroll to bottom
    setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 100);

    try {
      const historyContents = chatMessages.slice(1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: base64File,
                },
              },
              {
                text: "Tolong review dokumen ini."
              }
            ]
          },
          {
            role: 'model',
            parts: [{ text: "Saya telah mereview dokumen tersebut. Ada yang bisa saya bantu?" }]
          },
          ...historyContents,
          {
            role: 'user',
            parts: [{ text: userMessage }]
          }
        ],
        config: {
          systemInstruction: `You are a legal and accounting expert specializing in PSAK 116. You have already provided an assessment for the uploaded lease contract. Answer the user's questions about the document, explain your reasoning, or acknowledge corrections if the user points out a mistake. Use Bahasa Indonesia. Context of current assessment: ${JSON.stringify(assessmentData)}`,
        }
      });

      const reply = response.text;
      if (reply) {
        setChatMessages(prev => [...prev, { role: 'model', text: reply }]);
        setTimeout(() => {
          if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
          }
        }, 100);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setChatMessages(prev => [...prev, { role: 'model', text: 'Maaf, terjadi kesalahan saat memproses pesan Anda. Silakan coba lagi.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-sm">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Intelligent Contract Management
          </h1>
        </div>
        <div className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          Lease Assessment Generator
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {!assessmentData ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto"
          >
            <div className="mb-8">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 mb-2">
                Upload Lease Contract
              </h2>
              <p className="text-slate-500 max-w-2xl">
                Upload your lease agreement (PDF) to automatically extract key terms and generate an accounting journal entry.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-6">
                {/* Upload Area */}
                <div
                  className={`relative border-2 border-dashed rounded-2xl p-12 transition-all duration-200 ease-in-out flex flex-col items-center justify-center text-center min-h-[320px]
                    ${isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'}
                    ${file && !isAnalyzing ? 'border-emerald-500 bg-emerald-50/30' : ''}
                    ${isAnalyzing ? 'border-indigo-500 bg-indigo-50/30' : ''}
                  `}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,application/pdf"
                    className="hidden"
                    disabled={isAnalyzing}
                  />
                  
                  <AnimatePresence mode="wait">
                    {isAnalyzing ? (
                      <motion.div
                        key="analyzing"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex flex-col items-center"
                      >
                        <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
                          <FileUp className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900 mb-1">
                          Uploading & Analyzing...
                        </h3>
                        <p className="text-sm text-slate-500 mb-6">
                          Extracting PSAK 116 details from {file?.name || 'document'}
                        </p>
                        <button
                          disabled
                          className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg shadow-sm flex items-center gap-2 opacity-80 cursor-not-allowed"
                        >
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing Document
                        </button>
                      </motion.div>
                    ) : !file ? (
                      <motion.div
                        key="upload-prompt"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex flex-col items-center"
                      >
                        <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
                          <FileUp className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900 mb-1">
                          Click to upload or drag and drop
                        </h3>
                        <p className="text-sm text-slate-500 mb-6">
                          PDF documents up to 50MB
                        </p>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                        >
                          Select File
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="file-selected"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between"
                      >
                        <div className="flex items-center gap-4 overflow-hidden">
                          <div className="bg-emerald-100 p-3 rounded-lg flex-shrink-0">
                            <FileText className="w-6 h-6 text-emerald-600" />
                          </div>
                          <div className="text-left overflow-hidden">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {file.name}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={removeFile}
                          disabled={isAnalyzing}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
                          title="Remove file"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="md:col-span-1">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm sticky top-24">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">
                    How it works
                  </h3>
                  <ul className="space-y-6">
                    <li className="flex gap-4">
                      <div className="flex-shrink-0 mt-0.5 relative">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 relative ${file ? 'bg-emerald-100' : 'bg-indigo-100'}`}>
                          {file ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                          )}
                        </div>
                        <div className="absolute top-6 bottom-[-24px] left-3 w-px bg-slate-200"></div>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Upload Document</h4>
                        <p className="text-sm text-slate-500 mt-1 leading-relaxed">Upload your signed lease agreement in PDF format.</p>
                      </div>
                    </li>
                    <li className="flex gap-4">
                      <div className="flex-shrink-0 mt-0.5 relative">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 relative ${isAnalyzing ? 'bg-indigo-100' : 'bg-slate-100 border border-slate-200'}`}>
                          {isAnalyzing ? (
                            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                          ) : null}
                        </div>
                        <div className="absolute top-6 bottom-[-24px] left-3 w-px bg-slate-200"></div>
                      </div>
                      <div>
                        <h4 className={`text-sm font-semibold ${isAnalyzing ? 'text-slate-900' : 'text-slate-400'}`}>AI Extraction</h4>
                        <p className={`text-sm mt-1 leading-relaxed ${isAnalyzing ? 'text-slate-500' : 'text-slate-400'}`}>Our system automatically extracts dates, amounts, and key terms.</p>
                      </div>
                    </li>
                    <li className="flex gap-4">
                      <div className="flex-shrink-0 mt-0.5 relative">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center z-10 relative border border-slate-200">
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-400">Generate Assessment</h4>
                        <p className="text-sm text-slate-400 mt-1 leading-relaxed">Review the extracted data and generate the corresponding assessment.</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <button 
                  onClick={() => setAssessmentData(null)}
                  className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Upload
                </button>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
                  Assessment Results
                </h2>
                <p className="text-slate-500 mt-1">
                  Review the extracted PSAK 116 lease assessment details below.
                </p>
              </div>
              <button
                onClick={downloadExcel}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm hover:shadow-md"
              >
                <Download className="w-5 h-5" />
                Download Excel
              </button>
            </div>

            {!assessmentData.summary.isPSAK116 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-amber-800 font-medium">
                  Note: Based on the assessment, this contract does not fall under PSAK 116. It is identified as {assessmentData.summary.psakType}. The detailed lease assessment sections have not been generated.
                </div>
              </div>
            )}

            {/* Accounting Statement Dashboard */}
            {assessmentData.summary.isPSAK116 && assessmentData.summary.accountingStatement && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-lg font-semibold text-slate-900">Accounting Statement (Estimates)</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <h4 className="text-sm font-medium text-slate-500 mb-1">Initial ROU Asset</h4>
                    <p className="text-xl font-semibold text-slate-900">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: assessmentData.summary.currency }).format(assessmentData.summary.accountingStatement.initialROUAsset)}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <h4 className="text-sm font-medium text-slate-500 mb-1">Initial Lease Liability</h4>
                    <p className="text-xl font-semibold text-slate-900">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: assessmentData.summary.currency }).format(assessmentData.summary.accountingStatement.initialLeaseLiability)}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <h4 className="text-sm font-medium text-slate-500 mb-1">Monthly Depreciation</h4>
                    <p className="text-xl font-semibold text-slate-900">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: assessmentData.summary.currency }).format(assessmentData.summary.accountingStatement.monthlyDepreciation)}
                    </p>
                  </div>
                </div>
                <div className="bg-indigo-50 text-indigo-800 text-sm p-3 rounded-lg flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>{assessmentData.summary.accountingStatement.notes}</p>
                </div>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500 mb-1">Contract Type</h3>
                <p className="text-xl font-semibold text-slate-900">
                  {assessmentData.summary.contractType}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500 mb-1">Identified Asset</h3>
                <p className="text-xl font-semibold text-slate-900 truncate" title={assessmentData.summary.identifiedAsset}>
                  {assessmentData.summary.identifiedAsset}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500 mb-1">Lease Term</h3>
                <p className="text-xl font-semibold text-slate-900">
                  {assessmentData.summary.leaseTermMonths} Months ({assessmentData.summary.termPeriodType})
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {assessmentData.summary.termBeginDate} - {assessmentData.summary.termEndDate}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500 mb-1">Fixed Lease Payment</h3>
                <p className="text-xl font-semibold text-slate-900 truncate" title={new Intl.NumberFormat('id-ID', { style: 'currency', currency: assessmentData.summary.currency }).format(assessmentData.summary.fixedLeasePayment)}>
                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: assessmentData.summary.currency }).format(assessmentData.summary.fixedLeasePayment)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Timing: {assessmentData.summary.paymentTiming}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500 mb-1">Termination Options</h3>
                <p className="text-lg font-semibold text-slate-900">
                  {assessmentData.summary.exerciseTerminationOptions}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500 mb-1">Non-Lease Component</h3>
                <p className="text-lg font-semibold text-slate-900">
                  {assessmentData.summary.nonLeaseComponent}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-medium text-slate-500 mb-1">Practical Expedient</h3>
                <p className="text-lg font-semibold text-slate-900">
                  {assessmentData.summary.practicalExpedient}
                </p>
              </div>
            </div>

            {/* Important Messages */}
            {assessmentData.summary.importantMessages && assessmentData.summary.importantMessages.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Info className="w-5 h-5 text-amber-600" />
                  <h3 className="text-lg font-semibold text-amber-900">Important Messages from Contract</h3>
                </div>
                <ul className="space-y-3">
                  {assessmentData.summary.importantMessages.map((msg, idx) => (
                    <li key={idx} className="flex gap-3 text-amber-800">
                      <div className="flex-shrink-0 mt-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                      </div>
                      <p className="text-sm leading-relaxed">{msg}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Insights Section */}
            {assessmentData.insights && assessmentData.insights.length > 0 && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-lg font-semibold text-indigo-900">Key Insights & Observations</h3>
                </div>
                <ul className="space-y-3">
                  {assessmentData.insights.map((insight, idx) => (
                    <li key={idx} className="flex gap-3 text-indigo-800">
                      <div className="flex-shrink-0 mt-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                      </div>
                      <p className="text-sm leading-relaxed">{insight}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Chart Section */}
            {assessmentData.summary.isPSAK116 && assessmentData.summary.fixedLeasePayment > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-lg font-semibold text-slate-900">Projected Lease Payments</h3>
                  </div>
                  <div className="h-64 sm:h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={generateChartData(assessmentData.summary)}
                        margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 12 }}
                          tickFormatter={(value) => new Intl.NumberFormat('id-ID', { notation: "compact", compactDisplay: "short" }).format(value)}
                        />
                        <Tooltip 
                          formatter={(value: number) => [new Intl.NumberFormat('id-ID', { style: 'currency', currency: assessmentData.summary.currency }).format(value), 'Payment Amount']}
                          labelFormatter={(label) => `Period: ${label}`}
                          cursor={{ fill: '#f1f5f9' }}
                          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }}
                          labelStyle={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '8px' }}
                        />
                        <Bar dataKey="amount" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={60} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {assessmentData.summary.costBreakdown && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                      <BarChart3 className="w-5 h-5 text-indigo-600" />
                      <h3 className="text-lg font-semibold text-slate-900">Cost Breakdown</h3>
                    </div>
                    <div className="h-64 sm:h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Fixed Payments', value: assessmentData.summary.costBreakdown.fixedPayments },
                              { name: 'Non-Lease Components', value: assessmentData.summary.costBreakdown.nonLeaseComponents },
                              { name: 'Other Costs', value: assessmentData.summary.costBreakdown.otherCosts },
                            ].filter(d => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            <Cell fill="#4f46e5" />
                            <Cell fill="#10b981" />
                            <Cell fill="#f59e0b" />
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: assessmentData.summary.currency }).format(value)}
                            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          />
                          <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Benchmark Comparison */}
            {assessmentData.summary.isPSAK116 && assessmentData.summary.benchmarkComparison && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Info className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-lg font-semibold text-emerald-900">Industry Benchmark Comparison</h3>
                </div>
                <p className="text-sm text-emerald-800 leading-relaxed">
                  {assessmentData.summary.benchmarkComparison}
                </p>
              </div>
            )}

            {/* Assessment Tables */}
            {assessmentData.summary.isPSAK116 && assessmentData.sections && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex border-b border-slate-200 overflow-x-auto">
                  <button
                    onClick={() => setActiveTab('generalDetails')}
                    className={`px-6 py-4 text-sm font-medium whitespace-nowrap ${activeTab === 'generalDetails' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                  >
                    1. General Details
                  </button>
                  <button
                    onClick={() => setActiveTab('leaseScopeIdentify')}
                    className={`px-6 py-4 text-sm font-medium whitespace-nowrap ${activeTab === 'leaseScopeIdentify' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                  >
                    2. PSAK 116 Scope
                  </button>
                  <button
                    onClick={() => setActiveTab('leaseTermAssessment')}
                    className={`px-6 py-4 text-sm font-medium whitespace-nowrap ${activeTab === 'leaseTermAssessment' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                  >
                    3. Lease Term
                  </button>
                  <button
                    onClick={() => setActiveTab('rouAndLiabilityAssessment')}
                    className={`px-6 py-4 text-sm font-medium whitespace-nowrap ${activeTab === 'rouAndLiabilityAssessment' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                  >
                    4. ROU & Liability
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th 
                          className="px-6 py-4 font-semibold text-slate-900 w-1/5 cursor-pointer group hover:bg-slate-100 transition-colors select-none"
                          onClick={() => handleSort('Description')}
                        >
                          <div className="flex items-center gap-2">
                            Description
                            <SortIcon field="Description" />
                          </div>
                        </th>
                        <th 
                          className="px-6 py-4 font-semibold text-slate-900 w-1/5 cursor-pointer group hover:bg-slate-100 transition-colors select-none"
                          onClick={() => handleSort('Keywords')}
                        >
                          <div className="flex items-center gap-2">
                            Keywords
                            <SortIcon field="Keywords" />
                          </div>
                        </th>
                        <th 
                          className="px-6 py-4 font-semibold text-slate-900 w-1/6 cursor-pointer group hover:bg-slate-100 transition-colors select-none"
                          onClick={() => handleSort('Source')}
                        >
                          <div className="flex items-center gap-2">
                            Source
                            <SortIcon field="Source" />
                          </div>
                        </th>
                        <th 
                          className="px-6 py-4 font-semibold text-slate-900 w-auto cursor-pointer group hover:bg-slate-100 transition-colors select-none"
                          onClick={() => handleSort('Assessment')}
                        >
                          <div className="flex items-center gap-2">
                            Assessment
                            <SortIcon field="Assessment" />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sortedTableData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-slate-700 align-top font-medium">
                            {row.Description}
                          </td>
                          <td className="px-6 py-4 text-slate-600 align-top">
                            {row.Keywords}
                          </td>
                          <td className="px-6 py-4 align-top">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${
                              row.Source.toLowerCase().includes('contract') 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {row.Source}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-700 align-top whitespace-pre-wrap leading-relaxed">
                            {row.Assessment || <span className="text-slate-400 italic">Perlu Input Manajemen</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* AI Chat Assistant */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-8 flex flex-col h-[500px]">
              <div className="bg-indigo-600 px-6 py-4 flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-white" />
                <h3 className="text-lg font-semibold text-white">Chat dengan Dokumen</h3>
              </div>
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'}`}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                ))}
                {isChatting && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      <span className="text-sm text-slate-500">AI sedang mengetik...</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 bg-white border-t border-slate-200">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Tanyakan sesuatu atau berikan koreksi..."
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    disabled={isChatting}
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatting}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </div>

          </motion.div>
        )}
      </main>
    </div>
  );
}

