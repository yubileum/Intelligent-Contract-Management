import React, { useState, useRef } from 'react';
import { Upload, FileText, X, ChevronRight, FileUp, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf' || droppedFile.name.endsWith('.pdf')) {
        setFile(droppedFile);
      } else {
        alert('Please upload a PDF file.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
          Lease Journal Generator
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
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
                ${file ? 'border-emerald-500 bg-emerald-50/30' : ''}
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
              />
              
              <AnimatePresence mode="wait">
                {!file ? (
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
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                      title="Remove file"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Action Button */}
            <div className="flex justify-end">
              <button
                disabled={!file}
                className={`flex items-center gap-2 px-8 py-3 rounded-xl font-medium transition-all ${
                  file
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg hover:-translate-y-0.5'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                Analyze Contract
                <ChevronRight className="w-5 h-5" />
              </button>
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
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center z-10 relative">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
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
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center z-10 relative border border-slate-200">
                    </div>
                    <div className="absolute top-6 bottom-[-24px] left-3 w-px bg-slate-200"></div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-400">AI Extraction</h4>
                    <p className="text-sm text-slate-400 mt-1 leading-relaxed">Our system automatically extracts dates, amounts, and key terms.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="flex-shrink-0 mt-0.5 relative">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center z-10 relative border border-slate-200">
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-400">Generate Journal</h4>
                    <p className="text-sm text-slate-400 mt-1 leading-relaxed">Review the extracted data and generate the corresponding accounting journal entries.</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
