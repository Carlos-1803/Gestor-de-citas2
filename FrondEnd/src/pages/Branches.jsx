export default function Branches({ branches, choose, add, retry }) {
  return <section>
    <p className="eyebrow">TUS ESTABLECIMIENTOS</p>
    <div className="section-head">
      <div><h1>Selector de Sucursales</h1><p>Elige la sucursal que quieres administrar en esta sesión.</p></div>
      <button className="primary" disabled={branches.loading} onClick={add}>Agregar nueva sucursal</button>
    </div>
    {branches.loading ? <p role="status" className="empty">Cargando tus sucursales…</p>
      : branches.error ? <div role="alert" className="panel"><p>{branches.error}</p><button className="outline" onClick={retry}>Reintentar</button></div>
        : <div className="shop-grid">{branches.shops.map((shop) => <article key={shop.id} className="panel branch-card">
          <h2>{shop.name}</h2><p>{shop.address}</p>
          <button className="primary" onClick={() => choose(shop.id)}>Administrar sucursal ↗</button>
        </article>)}</div>}
  </section>;
}
