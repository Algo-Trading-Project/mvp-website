import Layout from "./Layout.jsx";

import Pricing from "./Pricing";

import Dashboard from "./Dashboard";

import Downloads from "./Downloads";

import SampleDay from "./SampleDay";

import Docs from "./Docs";
import Methodology from "./Methodology";

import Home from "./Home";

import Account from "./Account";

import GetStarted from "./GetStarted";

import About from "./About";

import Contact from "./Contact";

import Signals from "./Signals";

import Data from "./Data";
import ApiDocs from "./ApiDocs";

import WhatsNew from "./WhatsNew";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    
    Pricing: Pricing,
    
    Dashboard: Dashboard,
    
    Downloads: Downloads,
    
    SampleDay: SampleDay,
    
    Docs: Docs,
    Methodology: Methodology,
    
    Home: Home,
    
    Account: Account,
    
    GetStarted: GetStarted,
    
    About: About,
    
    Contact: Contact,
    
    Signals: Signals,
    
    Data: Data,
    ApiDocs: ApiDocs,
    
    WhatsNew: WhatsNew,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<Pricing />} />
                
                
                <Route path="/Pricing" element={<Pricing />} />
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/Downloads" element={<Downloads />} />
                
                <Route path="/SampleDay" element={<SampleDay />} />
                
                <Route path="/Docs" element={<Docs />} />
                <Route path="/Methodology" element={<Methodology />} />
                
                <Route path="/Home" element={<Home />} />
                
                <Route path="/Account" element={<Account />} />
                
                <Route path="/GetStarted" element={<GetStarted />} />
                
                <Route path="/About" element={<About />} />
                
                <Route path="/Contact" element={<Contact />} />
                
                <Route path="/Signals" element={<Signals />} />
                
                <Route path="/Data" element={<Data />} />
                <Route path="/ApiDocs" element={<ApiDocs />} />
                
                <Route path="/WhatsNew" element={<WhatsNew />} />
                
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}
