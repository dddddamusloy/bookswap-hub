import { useEffect, useState } from 'react';
import { Auth, Books, Swaps, Admin } from './api';

const isAdminEmail = (email) => (email || '').toLowerCase() === 'admin@mail.com';

// same rule as backend: ≥8 chars, 1 upper, 1 lower, 1 digit, 1 symbol
const STRONG_PW = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

/* ===== Image URL helper (IMPORTANT) =====
   Ensures images come from your backend on Render in prod,
   and from localhost:5000 during local dev. */
const BACKEND =
  (typeof process !== 'undefined' && process.env.REACT_APP_API_URL) ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : 'https://bookswap-hub.onrender.com');

function imgUrl(img) {
  if (!img) return '';
  if (/^https?:\/\//i.test(img)) return img;      // already absolute
  const p = String(img).replace(/^\/+/, '');       // trim leading slash
  return `${BACKEND}/${p}`;                        // e.g. https://.../uploads/xyz.jpg
}

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('books'); // books | add | mybooks | myreq | admin
  const [books, setBooks] = useState([]);
  const [myReqs, setMyReqs] = useState([]);
  const [incoming, setIncoming] = useState([]); // incoming swap requests for me (used only in My Books)

  // auth forms
  const [mode, setMode] = useState('login'); // login | register
  const [cred, setCred] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [showPass, setShowPass] = useState(false);

  // add-book form
  const [form, setForm] = useState({ title: '', author: '', description: '', image: null });

  // search & edit
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', author: '', description: '', status: 'available', image: null });

  // offer selection for swap: map targetBookId -> offeredBookId
  const [offer, setOffer] = useState({});

  // --- Admin view state ---
  const [adminFilter, setAdminFilter] = useState('pending'); // pending | approved | rejected | ''
  const [adminBooks, setAdminBooks] = useState([]);

  // ---------- Admin helpers ----------
  async function adminLoad(status) {
    const r = await Admin.listBooks(status || '');
    setAdminBooks(r?.ok ? (r.books || []) : []);
  }
  async function adminApprove(id) { const r = await Admin.approve(id); if (r?.ok) adminLoad(adminFilter); }
  async function adminReject(id)  { const r = await Admin.reject(id);  if (r?.ok) adminLoad(adminFilter); }
  async function adminDelete(id)  {
    if (!window.confirm('Delete this book? This cannot be undone.')) return;
    const r = await Admin.delete(id);
    if (r?.ok) adminLoad(adminFilter);
  }

  // ---------- Owner/Admin delete ----------
  async function deleteBook(b) {
    if (!user?.email) return alert("Missing user email.");
    if (!window.confirm(`Delete "${b.title}"? This cannot be undone.`)) return;

    // Admin can use admin endpoint; owners use public delete with email check
    let ok = false;
    if (isAdminEmail(user.email)) {
      const r = await Admin.delete(b._id);
      ok = !!r?.ok;
    } else {
      const r = await Books.delete(b._id, user.email);
      ok = !!r?.ok;
    }
    if (!ok) return alert('Delete failed');

    // update local lists
    setBooks(prev => prev.filter(x => x._id !== b._id));
    if (user.email) {
      const inc = await Swaps.incoming(user.email);
      if (inc.ok) setIncoming(inc.swaps);
    }
  }

  // session check on load
  useEffect(() => {
    Auth.me().then(r => {
      if (r.ok) {
        setUser(r.user);
        setTab(isAdminEmail(r.user.email) ? 'admin' : 'books');
      }
    });
  }, []);

  // when auth state changes, prime some common data
  useEffect(() => {
    if (user) {
      Books.list().then(r => { if (r.ok) setBooks(r.books); });
      if (user.email) Swaps.incoming(user.email).then(r => r.ok && setIncoming(r.swaps));
    } else {
      setBooks([]); setMyReqs([]); setIncoming([]);
    }
  }, [user]);

  // load data when tab changes
  useEffect(() => {
    (async () => {
      if (!user) return;

      if (tab === 'books') {
        const r = await Books.list();
        if (r.ok) setBooks(r.books);
      }

      if (tab === 'mybooks') {
        const mine = await Books.mine();
        if (mine.ok) setBooks(mine.books);
        if (user.email) {
          const inc = await Swaps.incoming(user.email);
          if (inc.ok) setIncoming(inc.swaps);
        }
      }

      if (tab === 'myreq') {
        const r = await Swaps.mine(user.email);
        if (r.ok) setMyReqs(r.swaps);
      }

      if (tab === 'admin' && isAdminEmail(user.email)) {
        adminLoad(adminFilter);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user, adminFilter]);

  // ---------- Auth (login/register) ----------
  async function handleAuth(e) {
    e.preventDefault();

    if (mode === 'login') {
      const res = await Auth.login({ email: cred.email, password: cred.password });
      if (res?.ok) {
        setUser(res.user);
        setTab(isAdminEmail(res.user.email) ? 'admin' : 'books');
      } else {
        // Auth.login already shows lockout/attempt warnings via alert
        if (res?.error) alert(res.error);
      }
      return;
    }

    // mode === 'register'
    const { name, email, password, confirmPassword } = cred;

    if (!name || !email || !password || !confirmPassword) {
      alert('All fields are required.');
      return;
    }
    if (password !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }
    if (!STRONG_PW.test(password)) {
      alert('Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.');
      return;
    }

    const res = await Auth.register({ name, email, password, confirmPassword });
    if (res.ok) {
      alert('Registration successful! Please log in.');
      setMode('login');
      setCred({ name: '', email, password: '', confirmPassword: '' });
    } else {
      alert(res.error || 'Something went wrong.');
    }
  }

  async function addBook(e) {
    e.preventDefault();
    const fd = new FormData();
    fd.append('title', form.title);
    fd.append('author', form.author);
    fd.append('description', form.description);
    if (form.image) fd.append('image', form.image);
    if (user && user.email) fd.append('ownerEmail', user.email);

    const r = await Books.create(fd);
    if (r.ok) {
      setTab(isAdminEmail(user.email) ? 'admin' : 'books');
      setForm({ title: '', author: '', description: '', image: null });
      Books.list().then(x => x.ok && setBooks(x.books));
      if (isAdminEmail(user.email)) adminLoad(adminFilter);
      alert('Book submitted. Waiting for admin approval.');
    } else {
      alert(r.error || 'Upload failed');
    }
  }

  async function updateBook(e) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData();
    fd.append('title', editForm.title);
    fd.append('author', editForm.author);
    fd.append('description', editForm.description);
    if (editForm.image) fd.append('image', editForm.image);

    const r = await Books.update(editing._id, fd);
    if (r.ok) {
      setBooks(books.map(b => (b._id === r.book._id ? r.book : b)));
      setEditing(null);
      setEditForm({ title: '', author: '', description: '', status: 'available', image: null });
      alert('Saved.');
    } else {
      alert(r.error || 'Update failed');
    }
  }

  async function sendRequest(book) {
    const offeredBookId = offer[book._id];
    if (!offeredBookId) return alert("Choose one of your books to offer.");
    if (!user || !user.email) return alert("No user email in session.");

    const r = await Swaps.request({
      bookId: book._id,
      offeredBookId,
      requesterEmail: user.email,
      message: "Interested in swapping",
    });
    if (r.ok) {
      alert("Request sent!");
      setOffer(o => ({ ...o, [book._id]: '' }));
      if (tab === 'myreq') {
        const mine = await Swaps.mine(user.email);
        if (mine.ok) setMyReqs(mine.swaps);
      }
      if (user.email) {
        const inc = await Swaps.incoming(user.email);
        if (inc.ok) setIncoming(inc.swaps);
      }
    } else {
      alert(r.error || "Failed to send request");
    }
  }

  async function actOnSwap(id, action) {
    if (!user?.email) return alert("Missing owner email.");
    const r = await Swaps.act(id, action, user.email);
    if (!r.ok) return alert(r.error || 'Failed');
    const [inc, blist] = await Promise.all([Swaps.incoming(user.email), Books.list()]);
    if (inc.ok) setIncoming(inc.swaps);
    if (blist.ok) setBooks(blist.books);
  }

  const searchMatch = (b) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (b.title || '').toLowerCase().includes(s) || (b.author || '').toLowerCase().includes(s);
  };

  const myEmail = (user && user.email) ? user.email.toLowerCase() : null;
  const myId = user?.id || user?._id ? String(user.id || user._id) : null;

  const isMine = (b) => {
    const ownerEmail = (b.ownerEmail || '').toLowerCase();
    const ownerId = b.owner ? String(b.owner) : null;
    return (myEmail && ownerEmail && ownerEmail === myEmail) ||
           (myId && ownerId && ownerId === myId);
  };

  const myBooks = books.filter(b => isMine(b));
  const myBooksAvailable = myBooks.filter(b => b.status === 'available');

  const allApprovedNotMine = books.filter(
    b => b.approval === 'approved' && b.status === 'available' && !isMine(b) && searchMatch(b)
  );

  const offersByBook = incoming.reduce((acc, s) => {
    if (s.status === 'pending' && s.book?._id) {
      const key = s.book._id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
    }
    return acc;
  }, {});
  const pendingCount = incoming.filter(s => s.status === 'pending').length;

  function viewOfferedBook(swap) {
    const title = swap?.offeredBook?.title || '';
    setQ(title);
    setTab('books');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div style={{ maxWidth: 900, margin: "20px auto", fontFamily: "sans-serif" }}>
      <h1>📚 BookSwap Hub</h1>

      {!user && (
        <form onSubmit={handleAuth}>
          <h3>{mode === 'login' ? 'Login' : 'Register'}</h3>

          {mode === 'register' && (
            <input
              placeholder="Name"
              value={cred.name}
              onChange={e=>setCred({...cred, name:e.target.value})}
            />
          )}

          <input
            placeholder="Email"
            value={cred.email}
            onChange={e=>setCred({...cred, email:e.target.value})}
          />

          <div style={{ position: 'relative', display: 'inline-block' }}>
            <input
              placeholder="Password"
              type={showPass ? 'text' : 'password'}
              value={cred.password}
              onChange={e=>setCred({...cred, password:e.target.value})}
              autoComplete="new-password"
              style={{ paddingRight: 32 }}
            />
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              title={showPass ? 'Hide password' : 'Show password'}
              aria-label={showPass ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 6, top: '50%',
                transform: 'translateY(-50%)', border: 'none',
                background: 'transparent', cursor: 'pointer',
                fontSize: 16, lineHeight: 1
              }}
            >
              {showPass ? '🙈' : '👁️'}
            </button>
          </div>

          {mode === 'register' && (
            <input
              placeholder="Confirm password"
              type={showPass ? 'text' : 'password'}
              value={cred.confirmPassword}
              onChange={e=>setCred({...cred, confirmPassword:e.target.value})}
              autoComplete="new-password"
            />
          )}

          <button type="submit">{mode}</button>

          <p
            style={{cursor:"pointer", color:"blue"}}
            onClick={()=>{
              setMode(mode==='login'?'register':'login');
              // clear sensitive fields when switching modes
              setCred(c => ({ ...c, password: '', confirmPassword: '' }));
            }}
          >
            {mode==='login'?'Register':'Login'}
          </p>
        </form>
      )}

      {user && (
        <div>
          <p>Welcome, {user.name} ({isAdminEmail(user.email) ? 'admin' : 'user'})</p>
          <button onClick={()=>{
            Auth.logout().then(()=>{
              setUser(null); setBooks([]); setMyReqs([]); setIncoming([]); setTab('books');
              setCred(c => ({ ...c, password: '', confirmPassword: '' }));
              setShowPass(false);
            });
          }}>Logout</button>

          <div style={{marginTop:10}}>
            <button onClick={()=>setTab('books')}>All Books</button>
            <button onClick={()=>setTab('add')}>Add Book</button>
            <button onClick={()=>setTab('mybooks')}>
              My Books{pendingCount ? ` (${pendingCount})` : ''}
            </button>
            <button onClick={()=>setTab('myreq')}>My Requests</button>
            {isAdminEmail(user.email) && (
              <button onClick={()=>setTab('admin')}>Admin</button>
            )}
          </div>
        </div>
      )}

      {user && tab==='books' && (
        <div>
          <h3>“Swap, Share, and Discover Stories.”</h3>

          <div style={{margin:"8px 0"}}>
            <input
              placeholder="Search by title or author..."
              value={q}
              onChange={e=>setQ(e.target.value)}
              style={{width:"100%", padding:8}}
            />
          </div>

          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12}}>
            {allApprovedNotMine.map(b=>(
              <div key={b._id} style={{border:"1px solid #ddd", padding:12, borderRadius:6, background:'#fff'}}>
                {(b.image || b.imageUrl) && (
                  <img
                    src={imgUrl(b.imageUrl || b.image)}
                    alt={b.title}
                    onError={(e)=>{ e.currentTarget.src = '/logo192.png'; }}
                    style={{width:"100%", height:150, objectFit:"cover", borderRadius:4}}
                  />
                )}
                <div style={{marginTop:6}}><b>{b.title}</b> by {b.author}</div>
                <div style={{marginTop:4}}>{b.description}</div>
                <div style={{marginTop:4}}>Book ID: {b.bookId}</div>
                <div>Status: {b.status}</div>

                <div style={{marginTop:8}}>
                  {myBooksAvailable.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Add a book first (My Books) to offer a trade.
                    </div>
                  ) : (
                    <>
                      <select
                        value={offer[b._id] || ''}
                        onChange={e=>setOffer(prev=>({ ...prev, [b._id]: e.target.value }))}
                        onFocus={()=>{
                          if (!offer[b._id] && myBooksAvailable.length > 0) {
                            setOffer(prev => ({ ...prev, [b._id]: myBooksAvailable[0]._id }));
                          }
                        }}
                        style={{ width:'100%', marginBottom:6 }}
                      >
                        <option value="">Choose one of your books...</option>
                        {myBooksAvailable.map(mb => (
                          <option key={mb._id} value={mb._id}>
                            {mb.title} ({mb.bookId})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={()=>sendRequest(b)}
                        disabled={!offer[b._id]}
                        title={!offer[b._id] ? 'Pick one of your books first' : 'Request Swap'}
                        style={{ opacity: !offer[b._id] ? 0.6 : 1, cursor: !offer[b._id] ? 'not-allowed' : 'pointer' }}
                      >
                        Request Swap
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {allApprovedNotMine.length === 0 && <div>No books match.</div>}
          </div>
        </div>
      )}

      {user && tab==='add' && (
        <form onSubmit={addBook}>
          <h3>Add Book</h3>
          <input placeholder="Title" value={form.title} onChange={e=>setForm({...form, title:e.target.value})}/>
          <input placeholder="Author" value={form.author} onChange={e=>setForm({...form, author:e.target.value})}/>
          <textarea placeholder="Description" value={form.description} onChange={e=>setForm({...form, description:e.target.value})}/>
          <input type="file" onChange={e=>setForm({...form, image:e.target.files[0]})}/>
          <button type="submit">Add</button>
        </form>
      )}

      {user && tab==='mybooks' && (
        <div>
          <h3>My Books {pendingCount ? `— ${pendingCount} request(s)` : ''}</h3>
          {myBooks.length === 0 && <div>You haven’t added any books yet.</div>}

          {editing && (
            <form onSubmit={updateBook} style={{border:"1px solid #aaa", padding:12, marginBottom:14, borderRadius:6, background:'#fafafa'}}>
              <h4>Edit Book</h4>
              <div style={{marginBottom:8}}>Editing: <b>{editing.title}</b> (ID: {editing.bookId})</div>
              <input placeholder="Title" value={editForm.title} onChange={e=>setEditForm({...editForm, title:e.target.value})}/>
              <input placeholder="Author" value={editForm.author} onChange={e=>setEditForm({...editForm, author:e.target.value})}/>
              <textarea placeholder="Description" value={editForm.description} onChange={e=>setEditForm({...editForm, description:e.target.value})}/>
              <select value={editForm.status} onChange={e=>setEditForm({...editForm, status:e.target.value})}>
                <option value="available">available</option>
                <option value="swapped">swapped</option>
              </select>
              <input type="file" onChange={e=>setEditForm({...editForm, image:e.target.files[0]})}/>
              <div style={{marginTop:8}}>
                <button type="submit">Save</button>
                <button type="button" onClick={()=>{
                  setEditing(null);
                  setEditForm({ title:'', author:'', description:'', status:'available', image:null });
                }} style={{marginLeft:8}}>Cancel</button>
              </div>
            </form>
          )}

          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12}}>
            {myBooks.map(b=>(
              <div key={b._id} style={{border:"1px solid #ddd", padding:12, borderRadius:6, background:'#fff'}}>
                {(b.image || b.imageUrl) && (
                  <img
                    src={imgUrl(b.imageUrl || b.image)}
                    alt={b.title}
                    onError={(e)=>{ e.currentTarget.src = '/logo192.png'; }}
                    style={{width:"100%", height:150, objectFit:"cover", borderRadius:4}}
                  />
                )}
                <div style={{marginTop:6}}><b>{b.title}</b> by {b.author}</div>
                <div style={{marginTop:4}}>{b.description}</div>
                <div style={{marginTop:4}}>Book ID: {b.bookId}</div>
                <div>Status: {b.status}</div>

                <div style={{ marginTop:6 }}>
                  <button onClick={()=>{
                    setEditing(b);
                    setEditForm({
                      title: b.title || '',
                      author: b.author || '',
                      description: b.description || '',
                      status: b.status || 'available',
                      image: null
                    });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}>Edit</button>

                  {/* Delete (owner or admin) */}
                  <button
                    onClick={() => deleteBook(b)}
                    style={{ marginLeft:8, background:'#fee', borderColor:'#f99' }}
                  >
                    Delete
                  </button>
                </div>

                {(offersByBook[b._id] && offersByBook[b._id].length > 0) && (
                  <div style={{marginTop:10, borderTop:'1px solid #eee', paddingTop:8}}>
                    <div style={{fontWeight:'bold'}}>Offers ({offersByBook[b._id].length})</div>
                    {offersByBook[b._id].map(s => (
                      <div key={s._id} style={{margin:'6px 0'}}>
                        <div>
                          They offer: <b>{s.offeredBook?.title}</b> by {s.offeredBook?.author}
                          {' '}— Status: {s.status}
                          {' '}• <button
                                type="button"
                                onClick={() => viewOfferedBook(s)}
                                style={{ padding: 0, border: 'none', background: 'none', color: '#06c', textDecoration: 'underline', cursor: 'pointer' }}
                              >
                                View
                              </button>
                        </div>
                        {s.status === 'approved' && (
                          <div style={{marginTop:4, fontSize:12, background:'#f6fff6', padding:'6px 8px', border:'1px solid #cdeccd', borderRadius:4}}>
                            Approved ✅ — Contact each other:
                            {' '}<a href={`mailto:${s.requesterEmail}`}>{s.requesterEmail}</a>
                            {' '}↔{' '}
                            <a href={`mailto:${s.ownerEmail}`}>{s.ownerEmail}</a>
                          </div>
                        )}
                        {s.status === 'pending' && (
                          <div style={{marginTop:4}}>
                            <button onClick={()=>actOnSwap(s._id, 'approve')}>Approve</button>
                            <button onClick={()=>actOnSwap(s._id, 'reject')} style={{marginLeft:6}}>Reject</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {user && tab==='myreq' && (
        <div>
          <h3>My Requests</h3>
          {myReqs.map(r=>(
            <div key={r._id} style={{border:"1px solid #ddd", margin:5, padding:5, borderRadius:6, background:'#fff'}}>
              You offered <b>{r.offeredBook?.title}</b> for <b>{r.book?.title}</b> → Status: {r.status}
              { r.status === 'approved' && (
                <div style={{fontSize:12, marginTop:4}}>
                  Owner contact: <a href={`mailto:${r.ownerEmail}`}>{r.ownerEmail}</a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {user && tab==='admin' && isAdminEmail(user.email) && (
        <div>
          <h3>Admin · Books</h3>
          <div style={{margin:"8px 0"}}>
            <label>Filter: </label>
            <select value={adminFilter} onChange={e=>setAdminFilter(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </div>

          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12}}>
            {adminBooks.map(b=>(
              <div key={b._id} style={{border:"1px solid #ddd", padding:12, borderRadius:6, background:'#fff'}}>
                {(b.image || b.imageUrl) && (
                  <img
                    src={imgUrl(b.imageUrl || b.image)}
                    alt={b.title}
                    onError={(e)=>{ e.currentTarget.src = '/logo192.png'; }}
                    style={{width:"100%", height:150, objectFit:"cover", borderRadius:4}}
                  />
                )}
                <div style={{marginTop:6}}><b>{b.title}</b> by {b.author}</div>
                <div style={{marginTop:4}}>{b.description}</div>
                <div style={{marginTop:4}}>Book ID: {b.bookId}</div>
                <div>Status: {b.status}</div>
                <div style={{marginTop:8, display:'flex', gap:6, flexWrap:'wrap'}}>
                  <button onClick={()=>adminApprove(b._id)}>Approve</button>
                  <button onClick={()=>adminReject(b._id)}>Reject</button>
                  <button onClick={()=>adminDelete(b._id)} style={{ background:'#fee', borderColor:'#f99' }}>Delete</button>
                </div>
              </div>
            ))}
            {adminBooks.length === 0 && <div>No books.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
