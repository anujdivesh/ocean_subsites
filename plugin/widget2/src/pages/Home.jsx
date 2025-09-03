import React, { useEffect, useState, useRef, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import L from 'leaflet';
import '../components/css/expertcss.css';
import Spinner from 'react-bootstrap/Spinner';

// Import leaflet images so Webpack (CRA) bundles them correctly
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Patch leaflet icon URLs (works in CRA build)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

// Country configuration with IDs, colors, and coordinates
const countryConfigs = [
  { name: 'Fiji', id: 72, color: '#27ae60', center: [-18.1236, 178.4369] },
  { name: 'Tuvalu', id: 218, color: '#3498db', center: [-8.521176, 179.196192] },
  { name: 'Papua New Guinea', id: 167, color: '#e74c3c', center: [-6.314993, 143.95555] },
  { name: 'Solomon Islands', id: 193, color: '#9b59b6', center: [-9.64571, 160.156194] },
  { name: 'Vanuatu', id: 227, color: '#f1c40f', center: [-15.376706, 166.959158] },
  { name: 'Kiribati', id: 112, color: '#1abc9c', center: [1.4514, 172.9718] },
  { name: 'Marshall Islands', id: 134, color: '#d35400', center: [7.131474, 171.184478] },
  { name: 'Micronesia (Federated States of)', id: 140, color: '#34495e', center: [6.887481, 158.215072] },
  { name: 'Nauru', id: 149, color: '#e67e22', center: [-0.522778, 166.931503] },
  { name: 'Palau', id: 164, color: '#e84393', center: [7.51498, 134.58252] },
  { name: 'Tonga', id: 212, color: '#0984e3', center: [-21.179, -175.1982] },
  { name: 'Niue', id: 158, color: '#00b894', center: [-19.054445, -169.867233] },
  { name: 'Samoa', id: 183, color: '#6c5ce7', center: [-13.759, -172.1046] },
  // { name: 'Australia', id: 14, color: '#272323ff', center: [-25.2744, 133.7751] },
];

export default function Home() {
  const mapRef = useRef(null);
  const [basemap, setBasemap] = useState({
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  });
  const [basemapOption, setBasemapOption] = useState('osm');
  const [expertsData, setExpertsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedExperts, setSelectedExperts] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [filterText, setFilterText] = useState('');
  const markerClusterRef = useRef(null);
  const containerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  const normalizeLongitude = (lon) => {
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return lon;
  };

  const processExpertCoordinates = useCallback((expert) => {
    const countryConfig = countryConfigs.find(c => c.name.toLowerCase() === (expert.country || '').toLowerCase()) || countryConfigs[0];
    let longitude = expert.longitude ? parseFloat(expert.longitude) : countryConfig.center[1];
    longitude = normalizeLongitude(longitude);
    return {
      ...expert,
      latitude: expert.latitude ? parseFloat(expert.latitude) : countryConfig.center[0],
      longitude,
      color: countryConfig.color,
      country: countryConfig.name
    };
  }, []);

  const buildApiUrl = () => {
  const base = 'https://www.oceanexpert.net/api/v1/advanceSearch/search.json';
  const params = new URLSearchParams({ action: 'advSearch' });

  countryConfigs.forEach((c, i) => {
    if (i > 0) params.append('toggle[]', 'OR'); // OR 
    params.append('type[]', 'experts');
    params.append('filter[]', 'Country is');
    params.append('keywords[]', c.name); //  country name
  });

  params.append('limit', '1000');
  return `${base}?${params.toString()}`
  };

  const fetchExperts = useCallback(async () => {
    try {
      setLoading(true);
      // console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\\BUILD URL\\>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>")    
      // console.log(buildApiUrl());
      // console.log("<<<<<<<<<<<<<<<<<<\\BUILD URL\\<<<<<<<<<<<<<<<<<<")
      const response = await fetch(buildApiUrl());
      const data = await response.json();
      
      // Filter experts to only include countries from our countryConfigs
      const configCountryNames = countryConfigs.map(c => c.name.toLowerCase());
      const filteredExperts = data.results?.data.filter(expert => {
        const expertCountry = (expert.country || '').toLowerCase();
        return configCountryNames.includes(expertCountry);
      }) || [];
      
      const processedExperts = filteredExperts.map(processExpertCoordinates) || [];
      setExpertsData(processedExperts);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [processExpertCoordinates]);

  function lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    // Explicit parentheses to satisfy lint rule for bitwise operations
    const composite = (1 << 24) | (R << 16) | (G << 8) | B;
    return `#${composite.toString(16).slice(1)}`;
  }

  // Setup map + dynamic plugin loading
  useEffect(() => {
    let isMounted = true;
    async function setup() {
      if (!containerRef.current) return;
      // Dynamically load plugins (client-side only)
      await import('leaflet-bing-layer').catch(() => {});
      if (!window.L?.MarkerClusterGroup) {
        window.L = L;
        await import('leaflet.markercluster/dist/leaflet.markercluster.js');
        await import('leaflet.markercluster/dist/MarkerCluster.css');
        await import('leaflet.markercluster/dist/MarkerCluster.Default.css');
      }
      if (isMounted && !mapRef.current) {
        mapRef.current = L.map('map', { zoom: 4, center: [-8, 170.3053], attributionControl: false });
        mapRef.current.attributionControl = L.control.attribution({
          prefix: '<a href="https://www.spc.int/" target="_blank" rel="noopener noreferrer">SPC</a> | &copy; Pacific Community SPC'
        }).addTo(mapRef.current);
        L.tileLayer(basemap.url, { attribution: basemap.attribution }).addTo(mapRef.current);
        markerClusterRef.current = window.L.markerClusterGroup({
          maxClusterRadius: 40,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: true,
          zoomToBoundsOnClick: true
        });
        markerClusterRef.current.addTo(mapRef.current);
      }
    }
    setup();
    return () => { isMounted = false; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper to create a country marker (defined before populateMarkers)
  const createCountryMarker = useCallback((country, experts, avgLat, avgLng) => {
    const countryConfig = countryConfigs.find(c => c.name === country) || countryConfigs[0];
    const lighterColor = lightenColor(countryConfig.color, 15);
    const marker = L.marker([avgLat, avgLng], {
      icon: L.divIcon({
        className: 'custom-div-icon',
               html: `<div style="position:relative;">\n<div style="position:absolute;top:-5px;left:-5px;width:50px;height:50px;background-color:${lighterColor};border-radius:50%;z-index:-1;"></div>\n
               <div style="background-color:${countryConfig.color};color:white;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-weight:bold;">
        ${experts.length}
        </div>\n</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      }),
      expertData: experts
    });
    marker.on('click', () => { setSelectedExperts(experts); setSelectedCountry(country); setFilterText(''); });
    return marker;
  }, []);

  // Populate markers (after createCountryMarker is defined)
  const populateMarkers = useCallback(() => {
    if (mapRef.current && markerClusterRef.current && expertsData.length > 0 && window.L.MarkerClusterGroup) {
      markerClusterRef.current.clearLayers();
      const countryGroups = {};
      expertsData.forEach(expert => { const country = expert.country || 'Unknown'; (countryGroups[country] = countryGroups[country] || []).push(expert); });
      Object.entries(countryGroups).forEach(([country, experts]) => {
        const avgLat = experts.reduce((s, e) => s + e.latitude, 0) / experts.length;
        let avgLng = experts.reduce((s, e) => s + e.longitude, 0) / experts.length;
        avgLng = normalizeLongitude(avgLng);
        const primaryMarker = createCountryMarker(country, experts, avgLat, avgLng);
        markerClusterRef.current.addLayer(primaryMarker);
        if (Math.abs(avgLng) > 150) {
          const secondaryLng = avgLng > 0 ? avgLng - 360 : avgLng + 360;
          const secondaryMarker = createCountryMarker(country, experts, avgLat, secondaryLng);
          markerClusterRef.current.addLayer(secondaryMarker);
        }
      });
    }
  }, [expertsData, createCountryMarker]);

  // Basemap change effect (after populateMarkers is defined)
  useEffect(() => {
    if (mapRef.current && markerClusterRef.current) {
      const newLayer = L.tileLayer(basemap.url, { attribution: basemap.attribution });
      newLayer.addTo(mapRef.current);
      mapRef.current.eachLayer(layer => { if (layer instanceof L.TileLayer && layer !== newLayer) mapRef.current.removeLayer(layer); });
      if (!mapRef.current.hasLayer(markerClusterRef.current)) mapRef.current.addLayer(markerClusterRef.current);
      setTimeout(() => populateMarkers(), 100);
    }
  }, [basemap, populateMarkers]);

  // Basemap option to URL mapping
  useEffect(() => {
    if (basemapOption === 'satellite') {
      setBasemap({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'
      });
    } else if (basemapOption === 'osm') {
      setBasemap({ url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' });
    } else {
      setBasemap({ url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenTopoMap (CC-BY-SA)' });
    }
  }, [basemapOption]);

  // Basemap switcher panel
  useEffect(() => {
    if (mapRef.current) {
      const existing = document.querySelector('.expert-basemap-panel');
      if (existing) existing.remove();
      const panel = L.DomUtil.create('div', 'expert-basemap-panel leaflet-bar');
      Object.assign(panel.style, { position: 'absolute', top: '20px', right: '20px', zIndex: 1001, background: 'var(--color-surface)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', padding: '8px 12px', display: 'flex', gap: '8px', alignItems: 'center' });
      const options = [
        { value: 'satellite', label: 'Satellite' },
        { value: 'osm', label: 'OpenStreetMap' },
        { value: 'opentopo', label: 'OpenTopoMap' }
      ];
      options.forEach(opt => {
        const btn = L.DomUtil.create('button', '', panel);
        btn.textContent = opt.label;
        Object.assign(btn.style, { background: basemapOption === opt.value ? 'var(--color-primary)' : 'var(--color-surface)', color: basemapOption === opt.value ? '#fff' : 'var(--color-text)', border: 'none', borderRadius: '6px', padding: '4px 10px', fontWeight: '500', cursor: 'pointer', transition: 'background 0.2s, color 0.2s' });
        btn.onmouseenter = () => btn.style.background = 'var(--color-accent)';
        btn.onmouseleave = () => btn.style.background = basemapOption === opt.value ? 'var(--color-primary)' : 'var(--color-surface)';
        btn.onclick = () => setBasemapOption(opt.value);
      });
      mapRef.current.getContainer().appendChild(panel);
    }
  }, [basemapOption]);

  useEffect(() => { fetchExperts(); }, [fetchExperts]);
  useEffect(() => { populateMarkers(); }, [populateMarkers]);

  const handleExpertHover = (expert, isHovering) => {
    if (!mapRef.current) return;
    mapRef.current.eachLayer(layer => {
      if (layer.options?.expertData?.id_ind === expert.id_ind) {
        const icon = isHovering ? L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color:${expert.color};color:white;border-radius:50%;width:50px;height:50px;display:flex;align-items:center;justify-content:center;font-weight:bold;border:3px solid white;box-shadow:0 0 10px rgba(0,0,0,0.5);">
          ${expert.fname?.[0]}${expert.sname?.[0]}</div>`,
          iconSize: [50, 50], iconAnchor: [25, 25]
        }) : L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color:${expert.color};color:white;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-weight:bold;">${expert.fname?.[0]}${expert.sname?.[0]}</div>`,
          iconSize: [40, 40], iconAnchor: [20, 20]
        });
        layer.setIcon(icon);
      }
    });
  };

  const filteredExperts = selectedExperts.filter(expert => {
    if (!filterText) return true;
    const searchStr = `${expert.fname || ''} ${expert.sname || ''}`.toLowerCase();
    return searchStr.includes(filterText.toLowerCase());
  });

  useEffect(() => { const onResize = () => setIsMobile(window.innerWidth <= 1004); onResize(); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); }, []);

  return (
    <div ref={containerRef} className="expert-container">
      {loading && (
        <div className="loading-overlay" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Spinner animation="border" variant="primary" />
          <span style={{ fontSize: '1.1rem' }}>Loading ocean experts data...</span>
        </div>
      )}
      {error && <div className="error-message">Error: {error}</div>}
      <div className="expert-main-content">
        {isMobile ? (
          <>
            <div id="map" className="map-container expert-map-container" />
            <div className="side-panel mobile-bottom-panel">
              <div className="panel-header"><h4 className="panel-title">{selectedCountry ? `${selectedCountry} Ocean Experts` : 'Pacific Ocean Experts'}</h4></div>
              {selectedExperts.length > 0 && (
                <div className="search-container">
                  <input type="text" placeholder="Filter by name..." value={filterText} onChange={e => setFilterText(e.target.value)} className="search-input" />
                  {filterText && <button className="clear-search" onClick={() => setFilterText('')}>×</button>}
                </div>
              )}
              <div className="expert-list-container">
                {selectedExperts.length > 0 ? (
                  filteredExperts.length > 0 ? (
                    <ul className="expert-list">
                      {filteredExperts.map((expert, idx) => (
                        <li key={idx} className="expert-item" onClick={() => mapRef.current.setView([expert.latitude, expert.longitude], 10)} onMouseEnter={() => handleExpertHover(expert, true)} onMouseLeave={() => handleExpertHover(expert, false)}>
                          <div className="expert-content">
                            <div className="expert-avatar" style={{ backgroundColor: expert.color }}>{expert.fname?.[0]}{expert.sname?.[0]}</div>
                            <div className="expert-details">
                              <b className="expert-name">{expert.fname} {expert.sname}</b>
                              <div className="expert-institution">{expert.inst_name || 'No institution specified'}</div>
                              <div className="expert-meta">
                                <span>Country: {expert.country}</span><span className="divider">|</span>
                                <a href={`https://oceanexpert.org/expert/${expert.id_ind}`} target="_blank" rel="noopener noreferrer" className="expert-link" onClick={e => e.stopPropagation()}>View Profile</a>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <div className="empty-state">No experts match your search criteria</div>
                ) : (
                  <div className="empty-state">
                    Click on a cluster to view experts
                    <div className="source-link-container">Source: <a href="https://oceanexpert.org/" target="_blank" rel="noopener noreferrer" className="source-link">oceanexpert.org</a></div>
                    <div className="disclaimer-container"><h5>Disclaimer</h5><p>Data and information provided on this site are provided "as is" ... The User specifically acknowledges and agrees that the use of this site is at the User's sole risk.</p></div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div id="map" className="map-container expert-map-container" />
            <div className="side-panel">
              <div className="panel-header"><h4 className="panel-title">{selectedCountry ? `${selectedCountry} Ocean Experts` : 'Pacific Ocean Experts'}</h4></div>
              {selectedExperts.length > 0 && (
                <div className="search-container">
                  <input type="text" placeholder="Filter by name..." value={filterText} onChange={e => setFilterText(e.target.value)} className="search-input" />
                  {filterText && <button className="clear-search" onClick={() => setFilterText('')}>×</button>}
                </div>
              )}
              <div className="expert-list-container">
                {selectedExperts.length > 0 ? (
                  filteredExperts.length > 0 ? (
                    <ul className="expert-list">
                      {filteredExperts.map((expert, idx) => (
                        <li key={idx} className="expert-item" onClick={() => mapRef.current.setView([expert.latitude, expert.longitude], 10)} onMouseEnter={() => handleExpertHover(expert, true)} onMouseLeave={() => handleExpertHover(expert, false)}>
                          <div className="expert-content">
                            <div className="expert-avatar" style={{ backgroundColor: expert.color }}>{expert.fname?.[0]}{expert.sname?.[0]}</div>
                            <div className="expert-details">
                              <b className="expert-name">{expert.fname} {expert.sname}</b>
                              <div className="expert-institution">{expert.inst_name || 'No institution specified'}</div>
                              <div className="expert-meta">
                                <span>Country: {expert.country}</span><span className="divider">|</span>
                                <a href={`https://oceanexpert.org/expert/${expert.id_ind}`} target="_blank" rel="noopener noreferrer" className="expert-link" onClick={e => e.stopPropagation()}>View Profile</a>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <div className="empty-state">No experts match your search criteria</div>
                ) : (
                  <div className="empty-state">
                    Click on a cluster to view experts
                    <div className="source-link-container">Source: <a href="https://oceanexpert.org/" target="_blank" rel="noopener noreferrer" className="source-link">oceanexpert.org</a></div>
                    <div className="disclaimer-container"><h5>Disclaimer</h5><p>Data and information provided on this site are provided "as is" ... The User specifically acknowledges and agrees that the use of this site is at the User's sole risk.</p></div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
