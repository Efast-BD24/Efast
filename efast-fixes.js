/* ============================================================
   efast-fixes.js  —  সব পেজের শেষে (</body> এর আগে) এই ফাইল লোড করুন:
   <script src="efast-fixes.js"></script>
   একটাই ফাইল ৬টা পেজে কাজ করে, নিজে থেকে পেজ চিনে নেয়।
   ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var has = function (id) { return !!$(id); };

  /* ---------- সাধারণ হেল্পার ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // onclick="fn('...')" এর ভেতরে ব্যবহারের জন্য (টাইটেলে ' থাকলে আর ভাঙবে না)
  function escJs(s) {
    return esc(s).replace(/\\/g, '\\\\').replace(/&#39;/g, "\\&#39;");
  }
  function money(n) { var x = parseFloat(n); return isNaN(x) ? '0.00' : x.toFixed(2); }

  /* ---------- পেজ অনুযায়ী Ad (Monetag ইত্যাদি) ---------- */
  var adLinksCache = null;
  function normAdLinks(obj) {
    if (!obj) return [];
    var arr = Array.isArray(obj) ? obj : Object.keys(obj).map(function (k) { return obj[k]; });
    return arr.filter(function (x) { return x && x.url && String(x.url).trim() !== ''; });
  }
  function pickAd(location) {
    var list = (adLinksCache || []).filter(function (x) { return x.location === location; });
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)].url;
  }
  // প্রথম ট্যাপে Ad খুলবে (ব্রাউজার পপ-আপ ব্লক করে না), ২ মিনিটে একবার
  function armPageAd(location) {
    try {
      var key = 'efAd_' + location;
      var last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 120000) return;
      var fired = false;
      var handler = function () {
        if (fired) return;
        var url = pickAd(location);
        if (!url) return;
        fired = true;
        sessionStorage.setItem(key, String(Date.now()));
        document.removeEventListener('click', handler, true);
        document.removeEventListener('touchend', handler, true);
        window.open(url, '_blank');
      };
      document.addEventListener('click', handler, true);
      document.addEventListener('touchend', handler, true);
    } catch (e) { console.warn('armPageAd', e); }
  }
  function preloadAdLinks(cb) {
    if (typeof db === 'undefined' || typeof auth === 'undefined') return;
    auth.onAuthStateChanged(function (u) {
      if (!u) return;
      db.ref('appSettings/adLinks').once('value').then(function (s) {
        adLinksCache = normAdLinks(s.val());
        if (cb) cb();
      }).catch(function () {});
    });
  }

  /* ---------- listener leak ঠেকানোর হেল্পার ---------- */
  var attached = {};
  function listen(key, query, cb) {
    if (attached[key]) { try { attached[key].q.off('value', attached[key].cb); } catch (e) {} }
    attached[key] = { q: query, cb: cb };
    query.on('value', cb);
  }
  function once(key) { if (attached['once_' + key]) return false; attached['once_' + key] = true; return true; }

  /* ============================================================
     INDEX (হোম পেজ)
     ============================================================ */
  if (has('hold-withdraw-btn') && has('main-app-section')) {

    // ১) ব্যান করা ইউজার ঢুকতে পারবে না
    auth.onAuthStateChanged(function (u) {
      if (!u) return;
      db.ref('users/' + u.uid + '/banned').on('value', function (s) {
        if (s.val() === true) {
          alert('🚫 আপনার অ্যাকাউন্ট ব্যান করা হয়েছে। সাপোর্টে যোগাযোগ করুন।');
          auth.signOut().then(function () { location.replace('login-signup.html'); });
        }
      });
    });

    // ২) গ্লোবাল পপ-আপ Ad: আগের কোড ট্যাপ ছাড়া window.open করত (ব্লক হত)
    globalPopupShown = true; // পুরনো setTimeout বন্ধ
    preloadAdLinks(function () { armPageAd('global_popup'); });

    // ৩) Ad cooldown: অ্যাডমিন প্যানেল videoCooldown (মিনিট) সেভ করে, অ্যাপ adCooldownSeconds পড়ত
    function cooldownMs() {
      var s = globalSettings || {};
      var sec = Number(s.adCooldownSeconds) || (Number(s.videoCooldown) * 60) || 1800;
      return sec * 1000;
    }

    window.updateAdCooldownUI = function () {
      var el = $('ad-cooldown-text'); if (!el) return;
      var today = new Date().toISOString().split('T')[0];
      var adData = userData.adData || { date: '', count: 0, lastClick: 0 };
      if (adData.date !== today) adData = { date: today, count: 0, lastClick: 0 };
      var dailyLimit = Number(globalSettings.videoDailyLimit) || 10;
      var diff = cooldownMs() - (Date.now() - (adData.lastClick || 0));
      el.classList.remove('hidden');
      if (adData.count >= dailyLimit) {
        el.innerText = 'Daily limit reached (' + adData.count + '/' + dailyLimit + ')'; el.style.color = '#f87171'; return;
      }
      if (diff > 0) {
        var t = Math.ceil(diff / 1000);
        el.innerText = t > 60 ? 'Next ad in ' + Math.ceil(t / 60) + ' min' : 'Next ad in ' + t + 's';
        el.style.color = '#facc15';
      } else {
        el.innerText = 'Available (' + adData.count + '/' + dailyLimit + ' today)'; el.style.color = '#34d399';
      }
    };

    window.startAdTask = function () {
      if (!isAdEnabled) { toast('error', 'Ad service is currently disabled by admin.'); return; }
      if (!navigator.onLine) { toast('error', 'No internet connection!'); return; }
      if (window.__adBusy) { toast('info', 'আগের Ad শেষ হওয়ার অপেক্ষা করুন...'); return; }

      var today = new Date().toISOString().split('T')[0];
      var adData = userData.adData || { date: '', count: 0, lastClick: 0 };
      if (adData.date !== today) {
        adData = { date: today, count: 0, lastClick: 0 };
        db.ref('users/' + userId + '/adData').set(adData);
      }
      var dailyLimit = Number(globalSettings.videoDailyLimit) || 10;
      if (adData.count >= dailyLimit) { toast('error', 'Daily ad limit (' + dailyLimit + ') reached! Come back tomorrow.'); return; }

      var now = Date.now(), cd = cooldownMs();
      if (now - (adData.lastClick || 0) < cd) {
        var rem = Math.ceil((cd - (now - (adData.lastClick || 0))) / 1000);
        toast('error', rem > 60 ? 'Please wait ' + Math.ceil(rem / 60) + ' min before next ad.' : 'Please wait ' + rem + 's before next ad.');
        return;
      }

      window.__adBusy = true;
      db.ref('users/' + userId + '/adData/lastClick').set(now);

      var bridges = [window.Android, window.HopWeb, window.App, window.WebApp, window.WebView, window.JSBridge, window.AndroidApp];
      for (var i = 0; i < bridges.length; i++) {
        if (bridges[i] && typeof bridges[i].showRewardedAd === 'function') {
          bridges[i].showRewardedAd();
          setTimeout(function () { window.__adBusy = false; }, 60000);
          return;
        }
      }
      // ওয়েব ফলব্যাক: Ad Links → video_ad
      var link = pickAd('video_ad');
      if (!link) {
        var raw = (globalSettings.adLinks ? normAdLinks(globalSettings.adLinks) : []).filter(function (x) { return x.location === 'video_ad'; });
        link = raw.length ? raw[Math.floor(Math.random() * raw.length)].url : (globalSettings.adLink || null);
      }
      if (link) {
        window.open(link, '_blank');
        toast('info', 'Ad দেখুন, ৩০ সেকেন্ড পর রিওয়ার্ড পাবেন...');
        setTimeout(function () { onAdWatched(); }, 30000);
      } else {
        toast('error', 'Ad service not available.');
        db.ref('users/' + userId + '/adData/lastClick').set(0);
        window.__adBusy = false;
      }
    };

    // ৪) রিওয়ার্ড: transaction দিয়ে (ডাবল রিওয়ার্ড / লিমিট বাইপাস বন্ধ)
    window.onAdWatched = function () {
      var today = new Date().toISOString().split('T')[0];
      var reward = Number(globalSettings.adReward) || 0;
      var limit = Number(globalSettings.videoDailyLimit) || 10;
      window.__adBusy = false;
      if (reward <= 0) { toast('error', 'Ad reward not set by admin.'); return; }
      var allowed = false;
      db.ref('users/' + userId + '/adData').transaction(function (a) {
        a = a || {};
        if (a.date !== today) a = { date: today, count: 0, lastClick: a.lastClick || 0 };
        if ((a.count || 0) >= limit) { allowed = false; return; }
        a.count = (a.count || 0) + 1; allowed = true; return a;
      }).then(function () {
        if (!allowed) { toast('error', 'Daily ad limit reached!'); return; }
        return db.ref('users/' + userId + '/balance').transaction(function (c) { return (c || 0) + reward; }).then(function (res) {
          if (!res.committed) { toast('error', 'Reward failed to save.'); return; }
          toast('success', 'You earned ৳' + reward.toFixed(2) + ' from ad!');
          addTransaction('Ad', 'Watch ad +৳' + reward.toFixed(2), reward);
        });
      }).catch(function (err) { toast('error', 'Reward save failed: ' + (err && err.message || 'unknown')); });
      updateAdCooldownUI();
    };

    // ৫) ডেইলি বোনাস: ডাবল-ট্যাপে দুইবার বোনাস পেত
    window.claimDailyBonus = function () {
      if (globalSettings.dailyBonusEnabled === false) { toast('error', 'Daily bonus is currently disabled.'); return; }
      var amount = Number(globalSettings.dailyBonusAmount) || 0;
      if (amount <= 0) { toast('error', 'Daily bonus not set by admin yet!'); return; }
      var now = Date.now(), cd = 24 * 60 * 60 * 1000, ok = false;
      db.ref('users/' + userId + '/lastBonusTime').transaction(function (last) {
        if (now - (last || 0) < cd) { ok = false; return; }
        ok = true; return now;
      }).then(function () {
        if (!ok) {
          var rem = cd - (now - (userData.lastBonusTime || 0));
          toast('info', 'Please wait ' + Math.max(0, Math.floor(rem / 3600000)) + 'h ' + Math.max(0, Math.floor((rem % 3600000) / 60000)) + 'm before claiming again.');
          return;
        }
        return db.ref('users/' + userId + '/balance').transaction(function (c) { return (c || 0) + amount; }).then(function () {
          toast('success', 'You earned ৳' + amount + ' bonus!');
          addTransaction('Bonus', 'Daily bonus +৳' + amount, amount);
        });
      }).catch(function (e) { toast('error', 'Bonus failed: ' + e.message); });
    };

    // ৬) টার্গেট বোনাস: আগে referCount কমিয়ে লক, তারপর টাকা
    window.claimTargetBonus = function () {
      if (!(targetBonusAmount > 0)) { toast('error', 'Target not completed yet.'); return; }
      var ok = false;
      db.ref('users/' + userId + '/referCount').transaction(function (c) {
        if ((c || 0) >= referTarget) { ok = true; return (c || 0) - referTarget; }
        ok = false; return;
      }).then(function () {
        if (!ok) { toast('error', 'Target not completed yet.'); return; }
        return db.ref('users/' + userId + '/balance').transaction(function (c) { return (c || 0) + targetBonusAmount; }).then(function () {
          toast('success', 'Target bonus ৳' + targetBonusAmount + ' claimed!');
          addTransaction('Target Bonus', 'Target bonus +৳' + targetBonusAmount, targetBonusAmount);
        });
      }).catch(function (e) { toast('error', 'Claim failed: ' + e.message); });
    };

    // ৭) উইথড্র: রিকোয়েস্ট ফেল করলে টাকা ফেরত
    window.completeWithdraw = function (amount, number) {
      holdDone = true;
      var btn = $('hold-withdraw-btn'), fill = $('hold-fill'), btnText = $('hold-btn-text');
      fill.style.width = '100%'; fill.style.backgroundColor = 'rgba(74,222,128,0.35)';
      btnText.innerHTML = '<i class="fas fa-clock mr-2 animate-spin"></i>Sending...';
      btn.classList.add('success-state');
      var method = selectedMethod;
      db.ref('users/' + userId + '/balance').transaction(function (cur) {
        if ((cur || 0) >= amount) return cur - amount; return;
      }).then(function (result) {
        if (!result.committed) {
          btnText.innerHTML = '<i class="fas fa-times-circle mr-2"></i>Failed!';
          toast('error', 'Insufficient balance (updated).');
          setTimeout(resetHoldBtn, 2500); return;
        }
        var wRef = db.ref('withdrawals').push();
        return wRef.set({
          uid: userId, method: method, amount: amount, phone: number,
          status: 'Pending', date: new Date().toISOString(), transactionId: wRef.key
        }).then(function () {
          btnText.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Request Sent!';
          addTransaction('Withdraw', 'Withdraw -৳' + amount + ' (' + method + ')', -amount);
          setTimeout(resetHoldBtn, 3000);
        }).catch(function (err) {
          // টাকা কেটে গেছে কিন্তু রিকোয়েস্ট যায়নি → ফেরত দিন
          db.ref('users/' + userId + '/balance').transaction(function (c) { return (c || 0) + amount; });
          btnText.innerHTML = '<i class="fas fa-times-circle mr-2"></i>Failed!';
          toast('error', 'Withdraw failed: ' + err.message);
          setTimeout(resetHoldBtn, 2500);
        });
      }).catch(function (err) {
        toast('error', 'Error: ' + err.message);
        setTimeout(resetHoldBtn, 2000);
      });
    };

    // ৮) হিস্ট্রি/র‍্যাঙ্কিং: প্রতিবার নতুন listener জমা হত + XSS ছিল
    window.loadWithdrawHistory = function () {
      if (!userId) return;
      listen('wd', db.ref('withdrawals').orderByChild('uid').equalTo(userId), function (snap) {
        var c = $('withdraw-history-list'), items = [];
        snap.forEach(function (ch) { items.push(ch.val()); });
        items.reverse();
        c.innerHTML = items.map(function (w) {
          var col = w.status === 'Approved' ? 'text-green-400' : w.status === 'Rejected' ? 'text-red-400' : 'text-yellow-400';
          return '<div class="history-item flex justify-between text-sm"><div><span>' + esc(w.method) + ' - ' + esc(w.phone) + '</span>' +
            (w.status === 'Rejected' && w.rejectReason ? '<span class="text-[10px] text-red-400 block">Reason: ' + esc(w.rejectReason) + '</span>' : '') +
            '</div><span>৳' + money(w.amount) + '</span><span class="' + col + '">' + esc(w.status) + '</span></div>';
        }).join('') || '<p class="text-gray-500 text-sm">No withdraw requests yet.</p>';
      });
    };
    function txRow(t, full) {
      var amt = Number(t.amount) || 0;
      var disp = amt > 0 ? '+৳' + money(amt) : '-৳' + money(Math.abs(amt));
      var color = amt >= 0 ? 'text-green-400' : 'text-red-400';
      if (full) {
        return '<div class="history-item flex justify-between items-center text-sm"><div><span class="font-bold">' + esc(t.type) +
          '</span><span class="text-gray-500 text-xs block">' + esc(new Date(t.date).toLocaleString()) + '</span></div><span class="' + color + ' font-bold">' + disp + '</span></div>';
      }
      return '<div class="flex justify-between text-xs border-b border-white/5 py-1"><span>' + esc(t.type) + '</span><span class="' + color + '">' + disp + '</span></div>';
    }
    window.loadFullHistory = function () {
      if (!userId) return;
      listen('full', db.ref('transactions/' + userId).orderByKey().limitToLast(50), function (snap) {
        var c = $('full-history-list'), items = [];
        snap.forEach(function (ch) { items.push(ch.val()); });
        items.reverse();
        c.innerHTML = items.length ? items.map(function (t) { return txRow(t, true); }).join('') : '<p class="text-gray-500 text-sm text-center py-4">No transactions yet.</p>';
      });
    };
    window.loadHomeHistory = function () {
      if (!userId) return;
      listen('home', db.ref('transactions/' + userId).orderByKey().limitToLast(5), function (snap) {
        var c = $('home-history'), items = [];
        snap.forEach(function (ch) { items.push(ch.val()); });
        items.reverse();
        c.innerHTML = items.length ? items.map(function (t) { return txRow(t, false); }).join('') : '<p class="text-gray-500 text-xs text-center">No recent activity</p>';
      });
    };
    window.loadRanking = function () {
      listen('rank', db.ref('users').orderByChild('balance').limitToLast(15), function (snap) {
        var list = [];
        snap.forEach(function (c) { var u = c.val(); if (u && u.userName) list.push(u); });
        list.reverse();
        $('ranking-list').innerHTML = list.map(function (u, i) {
          var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
          return '<div class="glass p-4 rounded-2xl flex justify-between items-center border-l-4 ' + (i < 3 ? 'border-yellow-500' : 'border-blue-500/30') + '">' +
            '<div class="flex items-center gap-3"><span class="text-xs font-black text-gray-500">' + medal + '</span><span class="font-bold text-sm">' + esc(u.userName) + '</span></div>' +
            '<span class="text-blue-400 font-black italic">৳' + formatBalance(u.balance) + '</span></div>';
        }).join('') || '<p class="text-gray-500 text-center">No users found.</p>';
      });
    };
  }

  /* ============================================================
     LOGIN / SIGNUP
     ============================================================ */
  if (has('forgotModal') && has('loginForm')) {

    // সাইনআপ/গুগল চলার সময় onAuthStateChanged যেন মাঝপথে রিডাইরেক্ট না করে
    ['handleSignup', 'handleGoogleSignIn'].forEach(function (name) {
      var orig = window[name];
      if (typeof orig !== 'function') return;
      window[name] = async function () {
        window.__busy = true;
        try { return await orig.apply(this, arguments); }
        finally { window.__busy = false; }
      };
    });

    // ফোন নম্বর নেওয়ার নিজস্ব পপ-আপ (WebView-তে prompt() কাজ করে না)
    function askPhone() {
      return new Promise(function (resolve) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
        wrap.innerHTML = '<div style="background:#141928;border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:24px;width:100%;max-width:360px;">' +
          '<h3 style="font-weight:900;font-size:18px;margin-bottom:6px;">মোবাইল নম্বর দিন</h3>' +
          '<p style="font-size:13px;color:#9ca3af;margin-bottom:14px;">সাইনআপ শেষ করতে আপনার নম্বর লাগবে (01XXXXXXXXX)</p>' +
          '<input id="ef-phone" type="tel" maxlength="11" placeholder="01XXXXXXXXX" style="width:100%;padding:14px;border-radius:14px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:15px;outline:none;">' +
          '<div style="display:flex;gap:10px;margin-top:16px;"><button id="ef-cancel" style="flex:1;padding:12px;border-radius:12px;background:transparent;border:1px solid rgba(255,255,255,.12);color:#9ca3af;font-weight:800;">Cancel</button>' +
          '<button id="ef-ok" style="flex:1;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font-weight:800;">Continue</button></div></div>';
        document.body.appendChild(wrap);
        var inp = wrap.querySelector('#ef-phone');
        inp.addEventListener('input', function () { inp.value = inp.value.replace(/[^0-9]/g, '').slice(0, 11); });
        wrap.querySelector('#ef-cancel').onclick = function () { wrap.remove(); resolve(null); };
        wrap.querySelector('#ef-ok').onclick = function () {
          if (!/^01[3-9]\d{8}$/.test(inp.value)) { toast('error', 'সঠিক নম্বর দিন (01XXXXXXXXX)'); return; }
          var v = inp.value; wrap.remove(); resolve(v);
        };
      });
    }

    async function applyReferral(referral, user, name) {
      var referrerUid = null, referrerData = null;
      if (referral) {
        var refSnap = await db.ref('users').orderByChild('accountId').equalTo(referral).once('value');
        if (refSnap.exists()) refSnap.forEach(function (c) { referrerUid = c.key; referrerData = c.val(); });
      }
      if (referrerUid && (referrerUid === user.uid || (referrerData && referrerData.email === user.email))) referrerUid = null;
      return referrerUid;
    }
    async function payReferrer(referrerUid, user, name) {
      try {
        var st = (await db.ref('appSettings').once('value')).val() || {};
        var reward = Number(st.referPerEarn) || 0;
        if (reward <= 0) return;
        await db.ref('users/' + referrerUid + '/balance').transaction(function (c) { return (c || 0) + reward; });
        await db.ref('users/' + referrerUid + '/referCount').transaction(function (c) { return (c || 0) + 1; });
        await db.ref('transactions/' + referrerUid).push({ type: 'Referral Bonus', description: 'New user joined with your code +৳' + reward, amount: reward, date: new Date().toISOString() });
        await db.ref('notifications/' + referrerUid).push({ title: '🎉 New Referral!', message: name + ' joined using your code. You earned ৳' + reward + '!', type: 'referral', sentAt: Date.now(), read: false });
        await db.ref('users/' + referrerUid + '/referrals').push({ uid: user.uid, name: name, joinedAt: Date.now() });
      } catch (e) { console.error('Referral reward failed:', e); }
    }

    async function finishGoogle(result, referral) {
      var user = result.user;
      var isNew = result.additionalUserInfo && result.additionalUserInfo.isNewUser;
      var exists = (await db.ref('users/' + user.uid).once('value')).exists();
      if (isNew || !exists) {
        var phone = await askPhone();
        if (!phone) {
          toast('error', 'মোবাইল নম্বর ছাড়া সাইনআপ হবে না।');
          try { await user.delete(); } catch (e) { await auth.signOut(); }
          showLoader(false); return;
        }
        var name = user.displayName || 'User';
        var refUid = await applyReferral(referral, user, name);
        await db.ref('users/' + user.uid).set({
          uid: user.uid, userName: name, email: user.email, userPhone: phone, balance: 0, referCount: 0,
          accountId: Math.floor(100000 + Math.random() * 900000).toString(),
          referredBy: refUid || '', banned: false, joinedAt: new Date().toISOString(), createdAt: Date.now()
        });
        if (refUid) await payReferrer(refUid, user, name);
        toast('success', 'Account created successfully!');
      } else {
        toast('success', 'Login successful!');
        db.ref('users/' + user.uid).update({ lastLogin: new Date().toISOString() }).catch(function () {});
      }
      showLoader(false);
      setTimeout(function () { location.replace('index.html'); }, 700);
    }

    window.handleGoogleSignIn = async function () {
      window.__busy = true;
      var referral = ($('signupReferral').value || '').trim().toUpperCase();
      var provider = new firebase.auth.GoogleAuthProvider();
      showLoader(true);
      try {
        var result = await auth.signInWithPopup(provider);
        await finishGoogle(result, referral);
      } catch (err) {
        console.error(err);
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment' || err.code === 'auth/web-storage-unsupported') {
          try { sessionStorage.setItem('efRef', referral); await auth.signInWithRedirect(provider); return; } catch (e2) { console.error(e2); }
        }
        showLoader(false);
        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') toast('info', 'Sign-in cancelled.');
        else if (err.code === 'auth/network-request-failed') toast('error', 'Network error. Check your internet.');
        else if (err.code === 'auth/unauthorized-domain') toast('error', 'এই ডোমেইন Firebase → Authorized domains এ যোগ করুন।');
        else toast('error', 'Google sign-in failed: ' + (err.code || err.message));
      } finally { window.__busy = false; }
    };

    // রিডাইরেক্ট পদ্ধতিতে গুগল সাইন-ইন ফিরে এলে
    auth.getRedirectResult().then(function (res) {
      if (res && res.user) {
        window.__busy = true; showLoader(true);
        return finishGoogle(res, sessionStorage.getItem('efRef') || '').finally(function () { window.__busy = false; });
      }
    }).catch(function (e) { console.error(e); });
  }

  /* ============================================================
     MICRO TASK
     ============================================================ */
  if (has('proofModal') && has('postJobModal')) {

    window.escapeHtml = esc;
    window.escapeAttr = escJs;

    preloadAdLinks(function () { armPageAd('micro_task'); });

    // ব্যালেন্স সুন্দর ফরম্যাটে
    auth.onAuthStateChanged(function (u) {
      if (!u) return;
      db.ref('users/' + u.uid + '/balance').on('value', function (s) {
        var b = $('header-balance'); if (b) b.textContent = money(s.val() || 0);
        var p = $('pj-balance'); if (p) p.textContent = money(s.val() || 0);
      });
    });

    // প্রতি ৩০ সেকেন্ডে নতুন listener জমা হচ্ছিল → একবারই লাগবে
    window.loadJobs = function () {
      if (!once('jobs')) return;
      db.ref('jobPosts').on('value', function (snap) {
        allJobs = [];
        snap.forEach(function (c) { var t = c.val(); if (t.status !== 'closed' && t.status !== 'rejected') allJobs.push(Object.assign({ id: c.key }, t)); });
        allJobs.reverse(); renderJobs();
      }, function (error) {
        $('taskList').innerHTML = '<div class="glass p-8 rounded-[2rem] text-center"><i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-3"></i><p class="text-red-400">Failed to load tasks.</p><p class="text-gray-600 text-xs mt-1">' + esc(error.message) + '</p></div>';
      });
    };
    window.loadAllSubmissions = function () {
      if (!once('subs')) return;
      db.ref('proofSubmissions').on('value', function (snap) {
        allSubmissions = [];
        snap.forEach(function (c) { allSubmissions.push(Object.assign({ _key: c.key }, c.val())); });
        allSubmissions.sort(function (a, b) { return (b.submittedAt || 0) - (a.submittedAt || 0); });
        if (currentView === 'myposts') renderMyPosts();
      });
    };
    window.loadMyPostedJobs = function () {
      if (!once('mine')) return;
      db.ref('jobPosts').on('value', function (snap) {
        myPostedJobs = [];
        snap.forEach(function (c) { var t = c.val(); if (t.userId === userId) myPostedJobs.push(Object.assign({ id: c.key }, t)); });
        myPostedJobs.reverse(); renderMyPosts();
      });
    };
    window.loadMySubmissions = function () {
      if (!once('mysubs')) return;
      db.ref('proofSubmissions').on('value', function (snap) {
        mySubmittedJobs = [];
        snap.forEach(function (c) { var s = c.val(); if (s.userId === userId && s.status !== 'rejected') mySubmittedJobs.push(s.jobKey); });
        renderJobs();
      });
    };

    // Approve: ডাবল-ক্লিকে দুইবার পেমেন্ট হত, লিমিটও চেক হত না
    window.approveWorkerSubmission = async function (subKey, workerUid, jobKey) {
      if (!confirm('Approve this worker and pay?')) return;
      try {
        var job = (await db.ref('jobPosts/' + jobKey).once('value')).val() || {};
        if (job.userId !== userId) { alert('❌ Only the job owner can approve.'); return; }
        if ((job.done || 0) >= (job.limit || 0)) { alert('❌ কাজের লিমিট পূর্ণ হয়ে গেছে।'); return; }
        var sub = (await db.ref('proofSubmissions/' + subKey).once('value')).val() || {};
        if (sub.jobKey !== jobKey) { alert('❌ ডেটা মিলছে না।'); return; }
        var worker = sub.userId, reward = Number(job.reward) || 0;

        var lock = await db.ref('proofSubmissions/' + subKey + '/status').transaction(function (s) { return s === 'pending' ? 'approved' : undefined; });
        if (!lock.committed) { alert('⚠️ এই সাবমিশন আগেই প্রসেস হয়েছে।'); return; }
        await db.ref('proofSubmissions/' + subKey).update({ approvedAt: Date.now(), approvedBy: userId });
        await db.ref('jobPosts/' + jobKey + '/done').transaction(function (d) { return (d || 0) + 1; });
        await db.ref('users/' + worker + '/balance').transaction(function (c) { return (c || 0) + reward; });
        await db.ref('transactions/' + worker).push({ type: 'Task Reward', description: 'Task "' + (job.title || '') + '" approved +৳' + reward, amount: reward, date: new Date().toISOString() });
        await db.ref('notifications/' + worker).push({ title: '✅ Task Approved', message: 'Your proof for "' + (job.title || '') + '" was approved! ৳' + reward + ' added to wallet.', type: 'task_approved', sentAt: Date.now(), read: false });
        alert('✅ Approved & ৳' + reward + ' paid!');
      } catch (e) { console.error(e); alert('❌ Error: ' + e.message); }
    };

    window.rejectWorkerSubmission = async function (subKey, workerUid) {
      var reason = prompt('Reject reason (optional):', 'Incomplete proof');
      if (reason === null) return;
      try {
        var lock = await db.ref('proofSubmissions/' + subKey + '/status').transaction(function (s) { return s === 'pending' ? 'rejected' : undefined; });
        if (!lock.committed) { alert('⚠️ এই সাবমিশন আগেই প্রসেস হয়েছে।'); return; }
        await db.ref('proofSubmissions/' + subKey).update({ rejectReason: reason || 'Not valid', rejectedAt: Date.now() });
        var sub = (await db.ref('proofSubmissions/' + subKey).once('value')).val() || {};
        if (sub.userId) await db.ref('notifications/' + sub.userId).push({ title: '❌ Task Rejected', message: 'Your proof was rejected. Reason: ' + (reason || 'Not valid'), type: 'task_rejected', sentAt: Date.now(), read: false });
        alert('✅ Rejected.');
      } catch (e) { console.error(e); alert('❌ Error: ' + e.message); }
    };

    // Cancel & refund: আগে জব মুছে, তারপর রিফান্ড (অ্যাডমিন অ্যাপ্রুভের সাথে রেস হবে না)
    window.deleteMyPost = async function (jobKey) {
      try {
        var job = (await db.ref('jobPosts/' + jobKey).once('value')).val() || {};
        if (job.userId !== userId) { alert('❌ Not your job.'); return; }
        if (job.status !== 'pending') { alert('❌ Only pending jobs can be cancelled.'); return; }
        var refund = Number(job.budget) || ((Number(job.reward) || 0) * (Number(job.limit) || 0));
        if (!confirm('Cancel this job and get ৳' + refund + ' refund?')) return;
        await db.ref('jobPosts/' + jobKey).remove();
        await db.ref('users/' + userId + '/balance').transaction(function (c) { return (c || 0) + refund; });
        await db.ref('transactions/' + userId).push({ type: 'Job Refund', description: 'Cancelled own job +৳' + refund, amount: refund, date: new Date().toISOString() });
        alert('✅ Job cancelled & ৳' + refund + ' refunded!');
      } catch (e) { alert('❌ Error: ' + e.message); }
    };
  }

  /* ============================================================
     FREELANCE
     ============================================================ */
  if (has('applyModal') && has('postGigModal')) {
    window.escapeHtml = esc;
    window.escapeAttr = escJs;
    preloadAdLinks(function () { armPageAd('freelance'); });

    // সার্চ করলে সব রেজাল্ট দেখাবে (আগে শুধু ৬টা দেখাত)
    window.renderGigs = function () {
      var grid = $('gigGrid');
      var filtered = allGigs;
      var searching = currentSearch.trim() !== '';
      if (searching) {
        var q = currentSearch.toLowerCase();
        filtered = filtered.filter(function (g) { return (g.title || '').toLowerCase().indexOf(q) > -1 || (g.description || '').toLowerCase().indexOf(q) > -1; });
      }
      if (!filtered.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-box-open"></i><p>No services found</p><p style="font-size:13px;font-weight:500;margin-top:6px;">Be the first to post a service!</p></div>';
        return;
      }
      var list = searching ? filtered : filtered.slice(0, 6);
      grid.innerHTML = list.map(function (g) {
        var name = g.sellerName || 'Freelancer';
        var isOwn = g.sellerUid === userId;
        var rating = g.rating ? Number(g.rating).toFixed(1) : '5.0';
        return '<div class="gig-card" onclick="openGigDetail(\'' + escJs(g.id) + '\')"><div class="gig-cover"><span class="gig-badge">' + esc(g.category || 'Service') + '</span><i class="fas ' + getCategoryIcon(g.category) + '"></i>' +
          (isOwn ? '<button class="gig-delete-btn" onclick="deleteMyGig(event, \'' + escJs(g.id) + '\')" title="Delete"><i class="fas fa-trash"></i></button>' : '') +
          '</div><div class="gig-body"><h4>' + esc(g.title || 'Untitled Service') + '</h4><div class="gig-seller"><div class="gig-seller-avatar">' + esc(name[0].toUpperCase()) + '</div><span>' + esc(name) + '</span></div>' +
          '<div class="gig-footer"><div class="gig-rating"><i class="fas fa-star"></i> ' + rating + '</div><div class="gig-price">৳' + esc(g.price || 0) + '<small> / job</small></div></div></div></div>';
      }).join('');
    };
  }

  /* ============================================================
     MARKETPLACE
     ============================================================ */
  if (has('productDetailModal') && has('postProductModal')) {
    window.escapeHtml = esc;
    preloadAdLinks(function () { armPageAd('marketplace'); });

    var IMGBB = '75f62af030fc6b88501b28b5b6f14d08';
    function compress(file, maxW, q) {
      return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function (e) {
          var img = new Image();
          img.onload = function () {
            var w = img.width, h = img.height;
            if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
            var c = document.createElement('canvas'); c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', q).split(',')[1]);
          };
          img.onerror = reject; img.src = e.target.result;
        };
        r.onerror = reject; r.readAsDataURL(file);
      });
    }

    // Firebase Storage (Spark প্ল্যানে চালু থাকে না) → ImgBB দিয়ে আপলোড
    window.submitProduct = async function () {
      var title = $('pp-title').value.trim(), category = $('pp-category').value, type = $('pp-condition').value;
      var desc = $('pp-desc').value.trim(), price = parseFloat($('pp-price').value) || 0;
      var accountAge = $('pp-location').value.trim(), phone = $('pp-phone').value.trim();
      var fa = $('pp-feat-aged').checked, fm = $('pp-feat-monetized').checked, fv = $('pp-feat-verified').checked;
      var file = $('pp-image').files && $('pp-image').files[0] ? $('pp-image').files[0] : null;

      if (title.length < 5 || title.length > 80) { alert('⚠️ Title must be 5-80 characters.'); return; }
      if (desc.length < 20 || desc.length > 1000) { alert('⚠️ Description must be 20-1000 characters.'); return; }
      if (price < 1 || price > 10000000) { alert('⚠️ Price must be between ৳1 and ৳1,00,00,000.'); return; }
      if (accountAge.length < 2 || accountAge.length > 30) { alert('⚠️ Account age must be 2-30 characters (e.g. "3 Years").'); return; }
      if (!/^01[3-9]\d{8}$/.test(phone)) { alert('⚠️ Invalid contact number (01XXXXXXXXX).'); return; }

      var btn = $('pp-submit-btn'); btn.disabled = true; btn.textContent = 'Publishing...';
      try {
        var imageUrl = '';
        if (file) {
          btn.textContent = 'Uploading screenshot...';
          var fd = new FormData(); fd.append('image', await compress(file, 1280, 0.75));
          var res = await fetch('https://api.imgbb.com/1/upload?key=' + IMGBB, { method: 'POST', body: fd });
          var data = await res.json();
          if (data && data.success && data.data && data.data.url) imageUrl = data.data.url;
          else { alert('⚠️ স্ক্রিনশট আপলোড হয়নি, ছবি ছাড়াই পাবলিশ হচ্ছে।'); }
        }
        btn.textContent = 'Publishing...';
        await db.ref('marketplaceProducts').push({
          title: title, category: category, type: type, condition: type, description: desc, price: price,
          accountAge: accountAge, location: accountAge, phone: phone,
          features: { aged: fa, monetized: fm, verified: fv },
          imageUrl: imageUrl, sellerUid: userId, sellerName: userName, sellerPhone: userPhone || phone,
          status: 'active', postedAt: Date.now()
        });
        try {
          var admins = (await db.ref('admins').once('value')).val() || {};
          await Promise.all(Object.keys(admins).map(function (a) {
            return db.ref('notifications/' + a).push({ title: '🛒 New Marketplace Listing', message: userName + ' listed: "' + title + '" for ৳' + price, type: 'marketplace_listing', sentAt: Date.now(), read: false });
          }));
        } catch (n) { console.warn('Admin notify failed:', n); }
        alert('✅ Listing published successfully!');
        closeModal('postProductModal');
      } catch (err) {
        console.error(err); alert('❌ Error: ' + err.message);
      } finally { btn.disabled = false; btn.textContent = 'Publish Listing'; }
    };

    window.deleteMyProduct = async function (event, productId) {
      event.stopPropagation();
      if (!confirm('Delete this listing?')) return;
      try {
        var p = (await db.ref('marketplaceProducts/' + productId).once('value')).val() || {};
        if (p.sellerUid !== userId) { alert('❌ You can only delete your own listings.'); return; }
        await db.ref('marketplaceProducts/' + productId).remove();
        alert('✅ Listing deleted.');
      } catch (e) { console.error(e); alert('❌ Error: ' + e.message); }
    };

    var cim = $('contactInfoModal');
    if (cim) cim.addEventListener('click', function (e) { if (e.target === cim) closeModal('contactInfoModal'); });
  }

  /* ============================================================
     DEPOSIT
     ============================================================ */
  if (has('successModal') && has('methodList')) {
    // submit-এর পর আবার listener জমা হত
    window.loadRecentDeposits = function () {
      if (!userId) return;
      var listEl = $('history-list');
      listen('dep', db.ref('depositRequests').orderByChild('userId').equalTo(userId), function (snap) {
        var items = [];
        snap.forEach(function (c) { items.push(c.val()); });
        items.sort(function (a, b) { return (b.submittedAt || 0) - (a.submittedAt || 0); });
        var recent = items.slice(0, 8);
        if (!recent.length) { listEl.innerHTML = '<div class="text-center py-6" style="color:#6b7280;font-size:13px;"><i class="fas fa-inbox mr-2"></i> No deposits yet</div>'; return; }
        listEl.innerHTML = recent.map(function (d) {
          var col = d.status === 'approved' ? '#34d399' : d.status === 'rejected' ? '#f87171' : '#fbbf24';
          var txt = d.status === 'approved' ? '✓ Approved' : d.status === 'rejected' ? '✕ Rejected' : '⏳ Pending';
          var time = d.submittedAt ? new Date(d.submittedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
          return '<div class="dep-history-item"><div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;"><span style="font-size:12px;color:#6b7280;font-weight:700;">' + esc((d.method || '').toUpperCase()) + '</span><span style="font-size:10px;color:#4b5563;">' + esc(time) + '</span></div>' +
            '<div style="font-size:11px;color:#6b7280;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">TrxID: ' + esc(d.txnId || '—') + '</div></div>' +
            '<div style="text-align:right;margin-left:10px;"><div style="font-size:14px;font-weight:800;color:white;">৳' + (Number(d.amount) || 0).toLocaleString() + '</div><div style="font-size:10px;color:' + col + ';font-weight:800;">' + txt + '</div></div></div>';
        }).join('');
      });
    };
    window.setAmount = function (amt) {
      $('deposit-amount').value = amt;
      document.querySelectorAll('.amt-btn').forEach(function (b) { b.classList.remove('active'); if (b.textContent.replace(/\D/g, '') === String(amt)) b.classList.add('active'); });
    };
  }
})();
