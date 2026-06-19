import React, { useState, useEffect, useRef } from 'react';
import { 
  KanbanSquare, 
  PlusCircle, 
  Settings, 
  MessageSquare, 
  Link2, 
  Calendar, 
  DollarSign, 
  Share2, 
  Trash2, 
  Edit3, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  RotateCw,
  RefreshCw
} from 'lucide-react';
import './App.css';

const API_BASE_URL = 'http://localhost:3001/api';

function App() {
  // Navegação
  const [activeTab, setActiveTab] = useState('kanban'); // 'kanban', 'novo', 'whatsapp', 'config'
  
  // Estados de dados
  const [offers, setOffers] = useState({});
  const [selectedKanbanTab, setSelectedKanbanTab] = useState('Criada'); // Para mobile view
  const [whatsappState, setWhatsappState] = useState({ status: 'DISCONNECTED', qr: null, groups: [] });
  const [settings, setSettings] = useState({
    shopee_app_id: '',
    shopee_app_secret: '',
    shopee_affiliate_id: '',
    whatsapp_api_url: '',
    whatsapp_api_token: '',
    whatsapp_api_client_id: '',
    python_service_url: '',
    python_service_token: '',
    default_group_id: ''
  });

  // Estado do formulário de nova oferta
  const [newOffer, setNewOffer] = useState({
    link: '',
    title: '',
    description: '',
    price: '',
    promoPrice: '',
    imageUrl: '',
    scheduledAt: '',
    targetGroup: ''
  });

  // Estados de controle de UI
  const [loadingScrape, setLoadingScrape] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [activeEditOffer, setActiveEditOffer] = useState(null); // Detalhes de oferta sendo editada
  const [toast, setToast] = useState(null);

  // Status de Kanban
  const kanbanStatuses = [
    { code: 'Criada', label: 'Criadas', color: 'var(--color-criada)', colorGlow: 'rgba(59, 130, 246, 0.2)' },
    { code: 'Postada', label: 'Postadas', color: 'var(--color-postada)', colorGlow: 'rgba(16, 185, 129, 0.2)' },
    { code: 'Em Campanha', label: 'Em Campanha', color: 'var(--color-em-campanha)', colorGlow: 'rgba(245, 158, 11, 0.2)' },
    { code: 'Encerrada', label: 'Encerradas', color: 'var(--color-encerrada)', colorGlow: 'rgba(107, 114, 128, 0.2)' },
    { code: 'Suspensa', label: 'Suspensas', color: 'var(--color-suspensa)', colorGlow: 'rgba(236, 72, 153, 0.2)' },
    { code: 'Cancelada', label: 'Canceladas', color: 'var(--color-cancelada)', colorGlow: 'rgba(239, 68, 68, 0.2)' }
  ];

  // Carregar dados iniciais
  useEffect(() => {
    fetchSettings();
    fetchAllOffers();
    fetchWhatsappStatus();

    // Polling periódico para status de conexão e QR code do WhatsApp (a cada 5s)
    const waInterval = setInterval(fetchWhatsappStatus, 5000);
    // Polling de ofertas a cada 30s para atualizar o Kanban dinamicamente
    const offersInterval = setInterval(fetchAllOffers, 30000);

    return () => {
      clearInterval(waInterval);
      clearInterval(offersInterval);
    };
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // -------------------------------------------------------------
  // REQUISIÇÕES DE API
  // -------------------------------------------------------------

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({ ...prev, ...data }));
        if (data.default_group_id && !newOffer.targetGroup) {
          setNewOffer(prev => ({ ...prev, targetGroup: data.default_group_id }));
        }
      }
    } catch (err) {
      console.error('Erro ao carregar configurações:', err);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setLoadingSave(true);
    try {
      const res = await fetch(`${API_BASE_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        showToast('Configurações e chaves de API salvas!');
      } else {
        showToast('Erro ao salvar configurações.', 'error');
      }
    } catch (err) {
      showToast('Erro de rede ao salvar configurações.', 'error');
    } finally {
      setLoadingSave(false);
    }
  };

  const fetchAllOffers = async () => {
    try {
      const fetchedOffers = {};
      for (const statusObj of kanbanStatuses) {
        const res = await fetch(`${API_BASE_URL}/offers/${statusObj.code}`);
        if (res.ok) {
          fetchedOffers[statusObj.code] = await res.json();
        }
      }
      setOffers(fetchedOffers);
    } catch (err) {
      console.error('Erro ao carregar ofertas:', err);
    }
  };

  const fetchWhatsappStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/whatsapp/status`);
      if (res.ok) {
        const data = await res.json();
        setWhatsappState(data);
      }
    } catch (err) {
      console.error('Erro ao carregar status do WhatsApp:', err);
    }
  };

  const syncWhatsappGroups = async () => {
    showToast('Sincronizando grupos...');
    try {
      const res = await fetch(`${API_BASE_URL}/whatsapp/sync-groups`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setWhatsappState(prev => ({ ...prev, groups: data.groups }));
        showToast('Grupos sincronizados com sucesso!');
      } else {
        showToast('Falha ao sincronizar grupos.', 'error');
      }
    } catch (err) {
      showToast('Erro de rede ao sincronizar grupos.', 'error');
    }
  };

  const handleScrape = async () => {
    if (!newOffer.link) {
      showToast('Por favor, cole um link primeiro.', 'error');
      return;
    }
    setLoadingScrape(true);
    try {
      const res = await fetch(`${API_BASE_URL}/offers/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newOffer.link })
      });
      if (res.ok) {
        const data = await res.json();
        setNewOffer(prev => ({
          ...prev,
          title: data.title || '',
          description: data.description || '',
          imageUrl: data.image_url || '',
          price: data.price || '',
          promoPrice: data.promo_price || ''
        }));
        showToast('Dados do anúncio extraídos com sucesso!');
      } else {
        showToast('Falha ao extrair dados do link.', 'error');
      }
    } catch (err) {
      showToast('Erro ao realizar scraping do link.', 'error');
    } finally {
      setLoadingScrape(false);
    }
  };

  const handleCreateOffer = async (e) => {
    e.preventDefault();
    if (!newOffer.link || !newOffer.scheduledAt || !newOffer.targetGroup) {
      showToast('Link, data e grupo de destino são obrigatórios.', 'error');
      return;
    }
    setLoadingSave(true);
    try {
      const res = await fetch(`${API_BASE_URL}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOffer)
      });
      if (res.ok) {
        showToast('Oferta cadastrada e agendada com sucesso!');
        // Reset formulário (mantendo grupo padrão)
        setNewOffer({
          link: '',
          title: '',
          description: '',
          price: '',
          promoPrice: '',
          imageUrl: '',
          scheduledAt: '',
          targetGroup: settings.default_group_id || ''
        });
        fetchAllOffers();
        setActiveTab('kanban');
      } else {
        showToast('Falha ao salvar oferta.', 'error');
      }
    } catch (err) {
      showToast('Erro de rede ao salvar oferta.', 'error');
    } finally {
      setLoadingSave(false);
    }
  };

  const handleUpdateStatus = async (offerId, newStatus) => {
    try {
      const res = await fetch(`${API_BASE_URL}/offers/${offerId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        showToast(`Status atualizado para: ${newStatus}`);
        fetchAllOffers();
      } else {
        showToast('Falha ao atualizar status.', 'error');
      }
    } catch (err) {
      showToast('Erro de rede ao atualizar status.', 'error');
    }
  };

  const handleDeleteOffer = async (offerId) => {
    if (!window.confirm('Tem certeza que deseja deletar esta oferta?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/offers/${offerId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Oferta excluída.');
        fetchAllOffers();
      } else {
        showToast('Falha ao deletar oferta.', 'error');
      }
    } catch (err) {
      showToast('Erro de rede ao deletar oferta.', 'error');
    }
  };

  const handleEditOfferSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/offers/${activeEditOffer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeEditOffer.title,
          description: activeEditOffer.description,
          price: activeEditOffer.price,
          promoPrice: activeEditOffer.promo_price,
          imageUrl: activeEditOffer.image_url,
          scheduledAt: activeEditOffer.scheduled_at,
          targetGroup: activeEditOffer.target_group
        })
      });
      if (res.ok) {
        showToast('Oferta atualizada com sucesso!');
        setActiveEditOffer(null);
        fetchAllOffers();
      } else {
        showToast('Falha ao atualizar oferta.', 'error');
      }
    } catch (err) {
      showToast('Erro de rede ao atualizar oferta.', 'error');
    }
  };

  // -------------------------------------------------------------
  // AUXILIARES DE RENDERIZAÇÃO
  // -------------------------------------------------------------

  const getWaBadgeClass = () => {
    switch (whatsappState.status) {
      case 'CONNECTED': return 'connected';
      case 'QR_READY': return 'qr_ready';
      default: return 'disconnected';
    }
  };

  const getWaBadgeLabel = () => {
    switch (whatsappState.status) {
      case 'CONNECTED': return 'WhatsApp Conectado';
      case 'QR_READY': return 'WhatsApp (Requer QR Code)';
      case 'CONNECTING': return 'WhatsApp Conectando...';
      default: return 'WhatsApp Desconectado';
    }
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="app-container">
      {/* Toast Alert */}
      {toast && (
        <div className={`glass-panel glow-${toast.type === 'error' ? 'shopee' : 'whatsapp'}`} style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '1rem 1.5rem',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.9rem',
          fontWeight: 700,
          background: 'rgba(19, 26, 38, 0.95)'
        }}>
          {toast.type === 'error' ? <AlertCircle color="var(--color-cancelada)" /> : <CheckCircle color="var(--whatsapp-green)" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">
          <span className="gradient-text-shopee">🚀</span>
          <span>App Campanhas</span>
        </h1>
        <div 
          className={`whatsapp-badge ${getWaBadgeClass()}`} 
          onClick={() => setActiveTab('whatsapp')}
        >
          <span className="status-dot"></span>
          <span>{getWaBadgeLabel()}</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-content">
        
        {/* ABA 1: KANBAN */}
        {activeTab === 'kanban' && (
          <div className="kanban-container">
            {/* Tabs Mobile */}
            <div className="kanban-tabs">
              {kanbanStatuses.map(status => (
                <button
                  key={status.code}
                  className={`kanban-tab-btn ${selectedKanbanTab === status.code ? 'active' : ''}`}
                  onClick={() => setSelectedKanbanTab(status.code)}
                  style={{
                    '--accent-color': status.color,
                    '--accent-color-glow': status.colorGlow
                  }}
                >
                  <span>{status.label}</span>
                  <span className="column-badge">{offers[status.code]?.length || 0}</span>
                </button>
              ))}
            </div>

            {/* Kanban Board */}
            <div className="kanban-board">
              {kanbanStatuses.map(status => {
                const columnOffers = offers[status.code] || [];
                const isActiveMobile = selectedKanbanTab === status.code;
                
                return (
                  <div 
                    key={status.code} 
                    className={`kanban-column ${isActiveMobile ? 'active-mobile' : ''}`}
                    style={{ '--column-color': status.color }}
                  >
                    <div className="column-header">
                      <div className="column-title">
                        <span>{status.label}</span>
                      </div>
                      <span className="column-badge">{columnOffers.length}</span>
                    </div>

                    <div className="column-cards">
                      {columnOffers.length === 0 ? (
                        <div style={{
                          textAlign: 'center',
                          color: 'var(--text-muted)',
                          fontSize: '0.75rem',
                          padding: '2rem 0'
                        }}>Nenhuma oferta</div>
                      ) : (
                        columnOffers.map(offer => (
                          <div 
                            key={offer.id} 
                            className="offer-card"
                            style={{ '--column-color': status.color }}
                            onClick={() => setActiveEditOffer(offer)}
                          >
                            {offer.image_url && (
                              <img src={offer.image_url} alt={offer.title} className="card-image" />
                            )}
                            <div className="card-title">{offer.title}</div>
                            
                            {(offer.price || offer.promo_price) && (
                              <div className="card-prices">
                                {offer.price && (
                                  <span className="card-price-original">
                                    {Number(offer.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </span>
                                )}
                                {offer.promo_price && (
                                  <span className="card-price-promo">
                                    {Number(offer.promo_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </span>
                                )}
                              </div>
                            )}

                            <div className="card-footer" onClick={(e) => e.stopPropagation()}>
                              <div className="card-date">
                                <Calendar size={12} />
                                <span>{formatDate(offer.scheduled_at)}</span>
                              </div>
                              <div className="card-actions">
                                <button 
                                  className="card-action-btn"
                                  title="Editar"
                                  onClick={() => setActiveEditOffer(offer)}
                                >
                                  <Edit3 size={12} />
                                </button>
                                <button 
                                  className="card-action-btn btn-delete" 
                                  title="Deletar"
                                  onClick={() => handleDeleteOffer(offer.id)}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ABA 2: NOVO CADASTRO */}
        {activeTab === 'novo' && (
          <div className="glass-panel form-panel">
            <h2 className="form-title">
              <PlusCircle color="var(--shopee-orange)" />
              <span>Nova Campanha de Oferta</span>
            </h2>

            <form onSubmit={handleCreateOffer}>
              <div className="input-group">
                <label><Link2 size={14} /> Link do Marketplace (Shopee)</label>
                <div className="input-row-link">
                  <input
                    type="url"
                    className="input-control"
                    placeholder="https://shopee.com.br/produto..."
                    value={newOffer.link}
                    onChange={(e) => setNewOffer(prev => ({ ...prev, link: e.target.value }))}
                    required
                  />
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={handleScrape}
                    disabled={loadingScrape}
                  >
                    {loadingScrape ? <Loader2 className="animate-spin" size={16} /> : 'Scrape'}
                  </button>
                </div>
              </div>

              {newOffer.imageUrl && (
                <div className="preview-card">
                  <img src={newOffer.imageUrl} alt="Preview" className="preview-img" />
                  <div className="preview-info">
                    <div className="preview-title">{newOffer.title}</div>
                    <div className="preview-desc">{newOffer.description}</div>
                  </div>
                </div>
              )}

              <div className="input-group">
                <label>Título do Anúncio</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Título estruturado para o anúncio"
                  value={newOffer.title}
                  onChange={(e) => setNewOffer(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div className="input-group">
                <label>Legenda / Cópia de Venda</label>
                <textarea
                  className="input-control"
                  placeholder="Digite o texto de persuasão que será enviado com a imagem..."
                  value={newOffer.description}
                  onChange={(e) => setNewOffer(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="price-grid">
                <div className="input-group">
                  <label><DollarSign size={14} /> Preço Original (De)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-control"
                    placeholder="0,00"
                    value={newOffer.price}
                    onChange={(e) => setNewOffer(prev => ({ ...prev, price: e.target.value }))}
                  />
                </div>
                <div className="input-group">
                  <label><DollarSign size={14} /> Preço Promocional (Por)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-control"
                    placeholder="0,00"
                    value={newOffer.promoPrice}
                    onChange={(e) => setNewOffer(prev => ({ ...prev, promoPrice: e.target.value }))}
                  />
                </div>
              </div>

              <div className="input-group">
                <label><Calendar size={14} /> Data/Hora de Processamento</label>
                <input
                  type="datetime-local"
                  className="input-control"
                  value={newOffer.scheduledAt}
                  onChange={(e) => setNewOffer(prev => ({ ...prev, scheduledAt: e.target.value }))}
                  required
                />
              </div>

              <div className="input-group">
                <label><MessageSquare size={14} /> Grupo do WhatsApp</label>
                {whatsappState.groups.length > 0 ? (
                  <select
                    className="input-control"
                    value={newOffer.targetGroup}
                    onChange={(e) => setNewOffer(prev => ({ ...prev, targetGroup: e.target.value }))}
                    required
                  >
                    <option value="">Selecione um grupo...</option>
                    {whatsappState.groups.map(group => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Nome do grupo ou JID do WhatsApp"
                    value={newOffer.targetGroup}
                    onChange={(e) => setNewOffer(prev => ({ ...prev, targetGroup: e.target.value }))}
                    required
                  />
                )}
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '1rem' }}
                disabled={loadingSave}
              >
                {loadingSave ? <Loader2 className="animate-spin" size={18} /> : 'Agendar Oferta'}
              </button>
            </form>
          </div>
        )}

        {/* ABA 3: WHATSAPP PANEL */}
        {activeTab === 'whatsapp' && (
          <div className="glass-panel whatsapp-panel">
            <h2 className="form-title">
              <MessageSquare color="var(--whatsapp-green)" />
              <span>Conexão do WhatsApp</span>
            </h2>

            <div className="qr-container">
              <div className="status-indicator">
                <span className={`status-dot ${getWaBadgeClass()}`}></span>
                <span style={{ textTransform: 'capitalize' }}>
                  {whatsappState.status === 'QR_READY' ? 'Aguardando Escaneamento' : whatsappState.status.toLowerCase()}
                </span>
              </div>

              {whatsappState.status === 'QR_READY' && whatsappState.qr && (
                <div style={{ textAlign: 'center' }}>
                  <img src={whatsappState.qr} alt="WhatsApp QR Code" className="qr-code-img" />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
                    Escaneie este QR Code no WhatsApp do seu celular em Dispositivos Conectados.
                  </p>
                </div>
              )}

              {whatsappState.status === 'CONNECTED' && (
                <div style={{ textAlign: 'center', color: 'var(--whatsapp-green)' }}>
                  <CheckCircle size={48} style={{ margin: '0 auto 1rem' }} />
                  <p style={{ fontWeight: 600 }}>Autenticado e pronto para postar!</p>
                </div>
              )}

              {whatsappState.status === 'CONNECTING' && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Loader2 className="animate-spin" size={48} style={{ margin: '0 auto 1rem' }} />
                  <p>Tentando abrir conexão com o WhatsApp...</p>
                </div>
              )}

              {whatsappState.status === 'DISCONNECTED' && !whatsappState.qr && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  <AlertCircle size={48} style={{ margin: '0 auto 1rem' }} />
                  <p>WhatsApp desconectado. Aguardando inicialização do QR Code...</p>
                </div>
              )}
            </div>

            {whatsappState.status === 'CONNECTED' && (
              <div className="groups-section">
                <div className="groups-header">
                  <span>Seus Grupos Disponíveis ({whatsappState.groups.length})</span>
                  <button className="card-action-btn" onClick={syncWhatsappGroups}>
                    <RefreshCw size={14} />
                  </button>
                </div>

                <div className="groups-list">
                  {whatsappState.groups.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem', fontSize: '0.8rem' }}>
                      Nenhum grupo carregado. Clique em sincronizar.
                    </div>
                  ) : (
                    whatsappState.groups.map(group => (
                      <div 
                        key={group.id} 
                        className={`group-item ${settings.default_group_id === group.id ? 'selected' : ''}`}
                        onClick={async () => {
                          setSettings(prev => ({ ...prev, default_group_id: group.id }));
                          // Atualiza no banco
                          await fetch(`${API_BASE_URL}/settings`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ default_group_id: group.id })
                          });
                          showToast(`Grupo "${group.name}" definido como padrão!`);
                        }}
                      >
                        <span className="group-name">{group.name}</span>
                        <span className="group-details">{group.participantsCount} participantes</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA 4: CONFIGURAÇÕES E CHAVES */}
        {activeTab === 'config' && (
          <div className="glass-panel form-panel">
            <h2 className="form-title">
              <Settings color="var(--text-secondary)" />
              <span>Chaves de API e Integrações</span>
            </h2>

            <form onSubmit={saveSettings}>
              
              <div style={{
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                marginBottom: '1rem',
                background: 'rgba(255, 255, 255, 0.02)',
                padding: '0.75rem',
                borderRadius: '8px',
                borderLeft: '3px solid var(--shopee-orange)'
              }}>
                🔑 Configure abaixo as credenciais de API oficiais do WhatsApp e Shopee, além da integração com o serviço Python compartilhado.
              </div>

              <h3 style={{ fontSize: '0.9rem', color: 'var(--shopee-orange)', margin: '1.25rem 0 0.75rem' }}>Shopee Affiliate API</h3>
              <div className="input-group">
                <label>Shopee App ID</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: API_USER_12345"
                  value={settings.shopee_app_id}
                  onChange={(e) => setSettings(prev => ({ ...prev, shopee_app_id: e.target.value }))}
                />
              </div>
              <div className="input-group">
                <label>Shopee App Secret</label>
                <input
                  type="password"
                  className="input-control"
                  placeholder="••••••••••••••••"
                  value={settings.shopee_app_secret}
                  onChange={(e) => setSettings(prev => ({ ...prev, shopee_app_secret: e.target.value }))}
                />
              </div>
              <div className="input-group">
                <label>Shopee Affiliate ID</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: 9876543"
                  value={settings.shopee_affiliate_id}
                  onChange={(e) => setSettings(prev => ({ ...prev, shopee_affiliate_id: e.target.value }))}
                />
              </div>

              <h3 style={{ fontSize: '0.9rem', color: 'var(--whatsapp-green)', margin: '1.25rem 0 0.75rem' }}>WhatsApp Gateway API (Evolution/Z-API)</h3>
              <div className="input-group">
                <label>WhatsApp API URL</label>
                <input
                  type="url"
                  className="input-control"
                  placeholder="https://api.evolution.sh/v1/..."
                  value={settings.whatsapp_api_url}
                  onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_api_url: e.target.value }))}
                />
              </div>
              <div className="input-group">
                <label>WhatsApp API Token</label>
                <input
                  type="password"
                  className="input-control"
                  placeholder="••••••••••••••••"
                  value={settings.whatsapp_api_token}
                  onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_api_token: e.target.value }))}
                />
              </div>
              <div className="input-group">
                <label>WhatsApp Client/Instance ID</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ex: minha_instancia_01"
                  value={settings.whatsapp_api_client_id}
                  onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_api_client_id: e.target.value }))}
                />
              </div>

              <h3 style={{ fontSize: '0.9rem', color: 'var(--accent-blue)', margin: '1.25rem 0 0.75rem' }}>Python Compartilhado Service</h3>
              <div className="input-group">
                <label>Python Service URL</label>
                <input
                  type="url"
                  className="input-control"
                  placeholder="https://meuservicopython.render.com"
                  value={settings.python_service_url}
                  onChange={(e) => setSettings(prev => ({ ...prev, python_service_url: e.target.value }))}
                />
              </div>
              <div className="input-group">
                <label>Python Service Token</label>
                <input
                  type="password"
                  className="input-control"
                  placeholder="••••••••••••••••"
                  value={settings.python_service_token}
                  onChange={(e) => setSettings(prev => ({ ...prev, python_service_token: e.target.value }))}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '1.5rem' }}
                disabled={loadingSave}
              >
                {loadingSave ? <Loader2 className="animate-spin" size={18} /> : 'Salvar Configurações'}
              </button>
            </form>
          </div>
        )}

      </main>

      {/* Modal de Detalhes / Edição de Oferta */}
      {activeEditOffer && (
        <div className="modal-overlay" onClick={() => setActiveEditOffer(null)}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Detalhes da Oferta</h3>
              <button className="close-btn" onClick={() => setActiveEditOffer(null)}>×</button>
            </div>
            
            <form onSubmit={handleEditOfferSubmit}>
              <div className="modal-body">
                {activeEditOffer.image_url && (
                  <img 
                    src={activeEditOffer.image_url} 
                    alt={activeEditOffer.title} 
                    style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '8px' }}
                  />
                )}
                
                <div className="input-group">
                  <label>Status Atual</label>
                  <select
                    className="input-control"
                    value={activeEditOffer.status}
                    onChange={(e) => handleUpdateStatus(activeEditOffer.id, e.target.value)}
                  >
                    {kanbanStatuses.map(st => (
                      <option key={st.code} value={st.code}>{st.label}</option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label>Título</label>
                  <input
                    type="text"
                    className="input-control"
                    value={activeEditOffer.title || ''}
                    onChange={(e) => setActiveEditOffer(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>

                <div className="input-group">
                  <label>Legenda / Cópia</label>
                  <textarea
                    className="input-control"
                    value={activeEditOffer.description || ''}
                    onChange={(e) => setActiveEditOffer(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div className="price-grid">
                  <div className="input-group">
                    <label>De (Preço)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-control"
                      value={activeEditOffer.price || ''}
                      onChange={(e) => setActiveEditOffer(prev => ({ ...prev, price: e.target.value }))}
                    />
                  </div>
                  <div className="input-group">
                    <label>Por (Preço)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-control"
                      value={activeEditOffer.promo_price || ''}
                      onChange={(e) => setActiveEditOffer(prev => ({ ...prev, promo_price: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label>Link da Imagem</label>
                  <input
                    type="text"
                    className="input-control"
                    value={activeEditOffer.image_url || ''}
                    onChange={(e) => setActiveEditOffer(prev => ({ ...prev, image_url: e.target.value }))}
                  />
                </div>

                <div className="input-group">
                  <label>Agendado Para</label>
                  <input
                    type="datetime-local"
                    className="input-control"
                    // Converte ISO string para datetime-local format
                    value={activeEditOffer.scheduled_at ? new Date(activeEditOffer.scheduled_at).toISOString().slice(0, 16) : ''}
                    onChange={(e) => setActiveEditOffer(prev => ({ ...prev, scheduled_at: new Date(e.target.value).toISOString() }))}
                  />
                </div>

                <div className="input-group">
                  <label>Grupo Alvo</label>
                  <input
                    type="text"
                    className="input-control"
                    value={activeEditOffer.target_group || ''}
                    onChange={(e) => setActiveEditOffer(prev => ({ ...prev, target_group: e.target.value }))}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setActiveEditOffer(null)}>
                  Fechar
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirmar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-nav">
        <button 
          className={`nav-item ${activeTab === 'kanban' ? 'active' : ''}`}
          onClick={() => setActiveTab('kanban')}
        >
          <KanbanSquare />
          <span>Kanban</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'novo' ? 'active' : ''}`}
          onClick={() => setActiveTab('novo')}
        >
          <PlusCircle />
          <span>Novo Link</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'whatsapp' ? 'active' : ''}`}
          onClick={() => setActiveTab('whatsapp')}
        >
          <MessageSquare />
          <span>WhatsApp</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          <Settings />
          <span>Ajustes</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
