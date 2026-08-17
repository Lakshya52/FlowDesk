import * as React from 'react';
import { X, Download, Search, FileSpreadsheet } from 'lucide-react';
import Modal from '@/shared/components/Modal';

interface DrilldownModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    data: any[];
}

const DrilldownModal: React.FC<DrilldownModalProps> = ({ isOpen, onClose, title, data }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} zIndex={100}>
            <div className="bg-surface border border-border w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up transform-gpu">
                {/* Modal Header */}
                <div className="px-8 py-6 border-b border-border flex items-center justify-between bg-surface relative z-20">
                    <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight text-text leading-none">{title}</h2>
                            <p className="text-xs font-semibold text-text-tertiary mt-1.5 uppercase tracking-wider">
                                Detailed Data View: <span className="text-primary font-bold">{data.length} records identified</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="h-10 px-5 bg-surface hover:bg-surface-hover border border-border rounded-xl text-xs font-bold uppercase tracking-wider text-text-secondary transition-all flex items-center gap-2.5 shadow-sm group/export">
                            <Download size={16} className="group-hover/export:translate-y-0.5 transition-transform" /> Export Grid
                        </button>
                        <button 
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center bg-surface hover:bg-danger/5 hover:text-danger rounded-xl text-text-tertiary transition-all border border-border hover:border-danger/20 group/close"
                        >
                            <X size={20} className="group-hover/close:rotate-90 transition-transform duration-300" />
                        </button>
                    </div>
                </div>

                {/* Data Grid */}
                <div className="flex-1 overflow-auto p-8 bg-bg/50">
                    {data.length === 0 ? (
                        <div className="h-100 flex flex-col items-center justify-center text-text-tertiary p-20 bg-surface rounded-2xl border-2 border-dashed border-border/60 group">
                             <div className="w-20 h-20 bg-surface-hover rounded-2xl border border-border mb-6 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-500">
                                <Search size={32} className="opacity-20 text-primary" />
                             </div>
                            <p className="text-sm font-semibold uppercase tracking-widest opacity-40">No records found for this view</p>
                        </div>
                    ) : (
                        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-surface border-b border-border text-text-tertiary text-[10px] uppercase font-bold tracking-widest">
                                        <tr>
                                            {Object.keys(data[0]).filter(k => k !== '_id' && k !== 'id' && k !== '__v' && k !== 'user').map(key => (
                                                <th key={key} className="px-8 py-4 font-bold">{key.replace(/([A-Z])/g, ' $1').trim()}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {data.map((item, i) => (
                                            <tr key={i} className="hover:bg-primary/[0.02] transition-colors group/row">
                                                {Object.entries(item as Record<string, any>).filter(([k]) => k !== '_id' && k !== 'id' && k !== '__v' && k !== 'user').map(([_, value], j) => (
                                                    <td key={j} className="px-8 py-4 text-sm text-text-secondary font-medium group-hover/row:text-text transition-colors duration-200">
                                                        {typeof value === 'object' ? 
                                                            <span className="text-[10px] font-bold text-text-tertiary bg-surface-hover px-3 py-1 rounded-full border border-border/40 italic">Object Reference</span> 
                                                            : String(value)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-border bg-surface flex justify-end relative z-10">
                    <button 
                        onClick={onClose}
                        className="btn btn-primary px-10 py-3 text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    >
                        Close Details
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default DrilldownModal;
