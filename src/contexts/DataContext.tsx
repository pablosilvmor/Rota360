import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Invoice } from '../pages/Invoices';
import { useAuth } from './AuthContext';

interface DataContextType {
  invoices: Invoice[];
  drafts: Invoice[];
  invoiceHistory: any[];
  fuelRecords: any[];
  fuelHistory: any[];
  vehicles: any[];
  drivers: any[];
  loadingInvoices: boolean;
  loadingFuel: boolean;
  loadingVehicles: boolean;
  loadingDrivers: boolean;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [drafts, setDrafts] = useState<Invoice[]>([]);
  const [invoiceHistory, setInvoiceHistory] = useState<any[]>([]);
  const [fuelRecords, setFuelRecords] = useState<any[]>([]);
  const [fuelHistory, setFuelHistory] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [loadingFuel, setLoadingFuel] = useState(true);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingDrivers, setLoadingDrivers] = useState(true);

  useEffect(() => {
    if (!user) {
      setInvoices([]);
      setDrafts([]);
      setInvoiceHistory([]);
      setFuelRecords([]);
      setFuelHistory([]);
      setVehicles([]);
      setDrivers([]);
      setLoadingInvoices(true);
      setLoadingFuel(true);
      return;
    }

    // Invoices - Limit to 500 most recent
    const qInvoices = query(collection(db, 'invoices'), orderBy('issueDate', 'desc'), limit(500));
    const unsubscribeInvoices = onSnapshot(qInvoices, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setInvoices(docs);
      setLoadingInvoices(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
      setLoadingInvoices(false);
    });

    // Drafts
    const qDrafts = query(collection(db, 'invoice_drafts'), orderBy('issueDate', 'desc'), limit(100));
    const unsubscribeDrafts = onSnapshot(qDrafts, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setDrafts(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoice_drafts');
    });

    // Invoice History
    const qInvHistory = query(collection(db, 'invoice_imports'), orderBy('date', 'desc'), limit(50));
    const unsubscribeInvHistory = onSnapshot(qInvHistory, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInvoiceHistory(docs);
    });

    // Fuel Records - Limit to 500 for performance
    const qFuel = query(collection(db, 'fuel_records'), orderBy('date', 'desc'), limit(500));
    const unsubscribeFuel = onSnapshot(qFuel, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFuelRecords(docs);
      setLoadingFuel(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fuel_records');
      setLoadingFuel(false);
    });

    // Fuel History
    const qFuelHistory = query(collection(db, 'fuel_imports'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribeFuelHistory = onSnapshot(qFuelHistory, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFuelHistory(docs);
    });

    // Vehicles
    const qVehicles = query(collection(db, 'vehicles'));
    const unsubscribeVehicles = onSnapshot(qVehicles, (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingVehicles(false);
    });

    // Drivers
    const qDrivers = query(collection(db, 'drivers'));
    const unsubscribeDrivers = onSnapshot(qDrivers, (snapshot) => {
      setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingDrivers(false);
    });

    return () => {
      unsubscribeInvoices();
      unsubscribeDrafts();
      unsubscribeInvHistory();
      unsubscribeFuel();
      unsubscribeFuelHistory();
      unsubscribeVehicles();
      unsubscribeDrivers();
    };
  }, [user]);

  return (
    <DataContext.Provider value={{ 
      invoices, 
      drafts,
      invoiceHistory,
      fuelRecords, 
      fuelHistory,
      vehicles, 
      drivers,
      loadingInvoices,
      loadingFuel,
      loadingVehicles,
      loadingDrivers
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
