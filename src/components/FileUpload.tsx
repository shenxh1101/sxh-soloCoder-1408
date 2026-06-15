import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, FileUp, AlertCircle } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { uploadCsv } from '@/utils/api';

export default function FileUpload() {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setResponse, setLoading, setError, sessionId, filename, error } = useDataStore();

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('请上传 CSV 文件');
      return;
    }
    setUploading(true);
    setLoading(true);
    setError('');
    try {
      const res = await uploadCsv(file);
      setResponse(res);
    } catch (e: any) {
      setError(e.message || '上传失败');
    } finally {
      setUploading(false);
      setLoading(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  if (sessionId) {
    return (
      <div className="flex items-center justify-between p-4 bg-slate-800/60 rounded-lg border border-slate-700">
        <div className="flex items-center gap-3">
          <FileUp className="w-5 h-5 text-blue-400" />
          <div>
            <div className="text-sm text-slate-200 font-medium">{filename}</div>
            <div className="text-xs text-slate-400">已加载，可继续操作</div>
          </div>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition"
        >
          重新上传
        </button>
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onChange} />
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl p-10 text-center transition-all ${
          dragging
            ? 'border-blue-400 bg-blue-500/10'
            : 'border-slate-600 hover:border-slate-500 bg-slate-800/40 hover:bg-slate-800/70'
        }`}
      >
        <Upload className={`w-12 h-12 mx-auto mb-3 ${dragging ? 'text-blue-400' : 'text-slate-500'}`} />
        <div className="text-lg font-medium text-slate-200 mb-1">
          {uploading ? '上传中...' : '拖拽 CSV 文件到这里，或点击选择'}
        </div>
        <div className="text-xs text-slate-500">支持 UTF-8 / GBK 编码的 CSV 文件</div>
      </div>
      <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onChange} />
      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
}
