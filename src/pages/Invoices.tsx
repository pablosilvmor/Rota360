import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface Invoice {
  id: string;
  number: string;
  issueDate: string;
  issuerName: string;
  issuerCNPJ: string;
  value: number;
  status: 'autorizada' | 'cancelada' | 'rejeitada';
  linkedVehicle?: string; // Placa do veículo associado
}

const mockInvoices: Invoice[] = [
  { id: '1', number: '000.123.456', issueDate: '2023-10-25', issuerName: 'AUTO PECAS SAO PAULO LTDA', issuerCNPJ: '12.345.678/0001-90', value: 850.00, status: 'autorizada', linkedVehicle: 'ABC-1234' },
  { id: '2', number: '000.123.457', issueDate: '2023-10-26', issuerName: 'POSTO IPIRANGA CENTRO', issuerCNPJ: '98.765.432/0001-10', value: 320.50, status: 'autorizada', linkedVehicle: 'XYZ-9876' },
  { id: '3', number: '000.123.458', issueDate: '2023-10-28', issuerName: 'PNEUS & CIA', issuerCNPJ: '55.666.777/0001-22', value: 2400.00, status: 'autorizada' },
  { id: '4', number: '000.123.459', issueDate: '2023-10-30', issuerName: 'OFICINA DO JOAO', issuerCNPJ: '33.444.555/0001-88', value: 150.00, status: 'cancelada' },
];

export function Invoices() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredInvoices = mockInvoices.filter(invoice => {
    const matchesSearch = 
      invoice.issuerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      invoice.number.includes(searchTerm) ||
      invoice.issuerCNPJ.includes(searchTerm) ||
      (invoice.linkedVehicle && invoice.linkedVehicle.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = filterStatus === 'all' || invoice.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'autorizada': return 'bg-green-100 text-green-800';
      case 'cancelada': return 'bg-red-100 text-red-800';
      case 'rejeitada': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold text-on-surface tracking-tight">Notas Fiscais (NFe)</h1>
          <p className="text-on-surface-variant">Central de pesquisa e visualização de notas emitidas para a empresa.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white border border-outline-variant text-on-surface rounded-xl font-bold hover:bg-surface-container-low transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined">refresh</span>
            Sincronizar SEFAZ
          </button>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-outline-variant flex flex-col md:flex-row gap-4 items-center justify-between bg-surface-container-lowest">
          <div className="relative flex-1 max-w-md w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input 
              type="text" 
              placeholder="Pesquisar por fornecedor, número, CNPJ ou placa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-xl pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="material-symbols-outlined text-on-surface-variant">filter_list</span>
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary flex-1"
            >
              <option value="all">Todos os Status</option>
              <option value="autorizada">Autorizada</option>
              <option value="cancelada">Cancelada</option>
              <option value="rejeitada">Rejeitada</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="p-4 font-bold text-sm text-on-surface-variant">Número</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant">Emissão</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant">Fornecedor</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant text-right">Valor</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant">Vínculo Frota</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant">Status</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice, index) => (
                <motion.tr 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  key={invoice.id} 
                  className="border-b border-outline-variant/50 hover:bg-surface-container-low/50 transition-colors group"
                >
                  <td className="p-4 text-sm font-semibold text-on-surface">{invoice.number}</td>
                  <td className="p-4 text-sm text-on-surface-variant">
                    {invoice.issueDate.split('-').reverse().join('/')}
                  </td>
                  <td className="p-4">
                    <div className="text-sm font-bold text-on-surface">{invoice.issuerName}</div>
                    <div className="text-xs text-on-surface-variant">{invoice.issuerCNPJ}</div>
                  </td>
                  <td className="p-4 text-sm font-bold text-on-surface text-right">
                    {invoice.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="p-4">
                    {invoice.linkedVehicle ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-bold font-mono">
                        <span className="material-symbols-outlined text-[14px]">directions_car</span>
                        {invoice.linkedVehicle}
                      </span>
                    ) : (
                      <span className="text-xs text-on-surface-variant italic cursor-pointer hover:text-primary transition-colors">Vincular veículo...</span>
                    )}
                  </td>
                  <td className="p-4">
                     <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColor(invoice.status)}`}>
                       {invoice.status}
                     </span>
                  </td>
                  <td className="p-4">
                     <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Visualizar PDF">
                         <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                       </button>
                       <button className="p-1.5 text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10 rounded-lg transition-colors" title="Download XML">
                         <span className="material-symbols-outlined text-[20px]">code</span>
                       </button>
                     </div>
                  </td>
                </motion.tr>
              ))}
              
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-[48px] mb-3 opacity-20">receipt_long</span>
                    <p>Nenhuma nota fiscal encontrada.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
