import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export function Fuel() {
  const [works, setWorks] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'works'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWorks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'works');
    });
    return () => unsubscribe();
  }, []);

  return (
    <motion.div 
      className="pb-12"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <motion.div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4" variants={itemVariants}>
        <div>
          <h2 className="text-[32px] font-semibold text-primary leading-[1.3] tracking-[-0.01em]">Gestão de Combustível</h2>
          <p className="text-base text-on-surface-variant mt-2">Monitore os abastecimentos, custos com combustível e gerencie os cartões da frota.</p>
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Filtrar por Obra</label>
            <select className="bg-surface border border-outline-variant rounded-lg px-4 py-2 text-sm font-semibold outline-none focus:border-primary transition-colors">
              <option>Todas as Obras</option>
              {works.map((work) => (
                <option key={work.id} value={work.name}>{work.name}</option>
              ))}
            </select>
          </div>
          <button className="self-end px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors">
            Gerenciar Cartões
          </button>
          <button className="self-end bg-primary text-on-primary px-4 py-2 rounded-lg font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Registrar Abastecimento
          </button>
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10" variants={containerVariants}>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-secondary-container text-on-secondary-container rounded-lg">
               <span className="material-symbols-outlined">payments</span>
            </div>
            <span className="bg-surface-container px-2 py-1 rounded text-xs font-bold text-on-surface-variant">Este Mês</span>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Custo Total</p>
          <h3 className="text-[36px] font-bold text-primary mt-1 leading-[1.2] tracking-[-0.02em]">R$ 84.150</h3>
          <p className="text-xs text-on-surface-variant mt-2">
            <span className="text-error font-bold">+5.2%</span> em relação ao mês anterior
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-tertiary-container text-on-tertiary-container rounded-lg">
              <span className="material-symbols-outlined">local_gas_station</span>
            </div>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Volume Abastecido</p>
          <h3 className="text-[36px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">14.280 L</h3>
          <p className="text-xs text-on-surface-variant mt-2">Diesel S10 representa 68% do total</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary-container text-on-primary-container rounded-lg">
              <span className="material-symbols-outlined">credit_card</span>
            </div>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Cartões Ativos</p>
          <h3 className="text-[36px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">120</h3>
          <p className="text-xs text-on-surface-variant mt-2">3 bloqueados por limite excedido</p>
        </motion.div>
      </motion.div>

      <motion.div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden mb-10" variants={itemVariants}>
        <div className="p-6 border-b border-outline-variant bg-white flex justify-between items-center">
          <h4 className="text-[18px] font-semibold text-primary">Histórico de Abastecimentos</h4>
          <button className="text-sm font-semibold text-primary hover:underline">Ver Relatório Completo</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase">Data</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase">Veículo</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase">Posto / Local</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase">Quantidade</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase">Valor Total</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase text-right">Cartão</th>
              </tr>
            </thead>
            <tbody>
              {[
                { data: 'Hoje, 09:14', id: 'VOL-4411', placa: 'QWE-1234', posto: 'Posto Ipiranga - Rodoanel', litros: '120L', tipo: 'Diesel S10', valor: 'R$ 754,80', cartao: '**** 4521' },
                { data: 'Hoje, 08:30', id: 'FIAT-112', placa: 'ASD-9876', posto: 'Posto BR - Anhanguera', litros: '45L', tipo: 'Gasolina Comum', valor: 'R$ 274,05', cartao: '**** 8820' },
                { data: 'Ontem, 18:45', id: 'MB-1092', placa: 'ZXC-5541', posto: 'Auto Posto Shell - Dutra', litros: '200L', tipo: 'Diesel S10', valor: 'R$ 1.258,00', cartao: '**** 9081' },
                { data: 'Ontem, 14:10', id: 'VOL-4412', placa: 'TYU-8822', posto: 'Posto Petrobras - Castelo', litros: '150L', tipo: 'Diesel S500', valor: 'R$ 915,00', cartao: '**** 4521' },
              ].map((item, idx) => (
                <tr key={idx} className="border-b border-outline-variant/30 hover:bg-surface-container transition-colors group">
                  <td className="px-6 py-4">
                    <span className="font-semibold text-sm">{item.data}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-primary">{item.id}</span>
                      <span className="font-mono text-xs text-on-surface-variant">{item.placa}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm">{item.posto}</span>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex flex-col">
                      <span className="font-bold text-sm">{item.litros}</span>
                      <span className="text-xs text-on-surface-variant">{item.tipo}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-sm">{item.valor}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-high text-xs font-mono">
                      <span className="material-symbols-outlined text-[14px]">credit_card</span>
                      {item.cartao}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}
