(() => {
    const $ = id => document.getElementById(id);
    let projects = [], photo = '', previewUrl;
    const notice = message => { $('notice').textContent = message; };
    async function api(url, method = 'GET', data) {
        const response = await fetch(url, { method, headers:data ? { 'Content-Type':'application/json' } : {}, body:data ? JSON.stringify(data) : undefined });
        const result = await response.json();
        if (!response.ok) {
            if (response.status === 401) showStudio(false);
            throw new Error(result.error || 'Request failed.');
        }
        return result;
    }
    function showStudio(visible) { $('studio').hidden = !visible; $('logout').hidden = !visible; $('login').hidden = visible; }
    function reset() {
        $('editor').reset(); $('project-id').value = ''; photo = ''; $('photo-preview').hidden = true;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        $('editor-title').textContent = 'Add a project'; $('photo').required = true;
    }
    function edit(project) {
        reset(); $('project-id').value = project.id;
        for (const key of ['name','category','description','url']) $(key).value = project[key];
        $('featured').checked = project.featured; $('photo').required = false;
        $('photo-preview').src = project.image; $('photo-preview').hidden = false;
        $('editor-title').textContent = 'Edit project'; $('editor').scrollIntoView({ behavior:'smooth', block:'start' }); $('name').focus({ preventScroll:true });
    }
    function node(tag, value) { const el = document.createElement(tag); if (value) el.textContent = value; return el; }
    async function refresh() {
        projects = await api('/api/projects');
        $('count').textContent = `${projects.filter(p => p.featured).length} / 6 on index · ${projects.length} projects`;
        $('library').replaceChildren();
        for (const project of projects) {
            const card = node('article'); card.className = 'admin-project';
            const image = node('img'); image.src = project.image; image.alt = project.name; image.loading = 'lazy';
            const label = node('label'); label.className = 'feature-switch';
            const toggle = node('input'); toggle.type = 'checkbox'; toggle.setAttribute('role','switch'); toggle.checked = project.featured;
            toggle.addEventListener('change', async () => {
                toggle.disabled = true;
                try { await api('/api/projects/' + project.id, 'PUT', { ...project, featured:toggle.checked }); await refresh(); notice('Index preview updated.'); }
                catch (error) { toggle.checked = project.featured; notice(error.message); }
                finally { toggle.disabled = false; }
            });
            label.append(toggle, node('span','Preview on index'));
            const editButton = node('button','Edit'); editButton.addEventListener('click', () => edit(project));
            const remove = node('button','Delete'); remove.addEventListener('click', async () => {
                if (!confirm(`Delete “${project.name}”?`)) return;
                remove.disabled = true;
                try { await api('/api/projects/' + project.id,'DELETE'); if ($('project-id').value === project.id) reset(); await refresh(); notice('Project deleted.'); }
                catch (error) { notice(error.message); remove.disabled = false; }
            });
            card.append(image,node('h3',project.name),node('p',project.category),label,editButton,remove); $('library').append(card);
        }
        if (!projects.length) $('library').append(node('p','Add your first project using the form.'));
    }
    $('photo').addEventListener('change', async () => {
        photo = ''; const file = $('photo').files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)) { notice('Choose a PNG, JPEG, or WebP smaller than 5 MB.'); $('photo').value = ''; return; }
        $('save').disabled = true;
        try {
            photo = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(file); $('photo-preview').src = previewUrl; $('photo-preview').hidden = false;
        } catch { notice('Could not read this photo. Please choose it again.'); }
        finally { $('save').disabled = false; }
    });
    $('login').addEventListener('submit', async event => {
        event.preventDefault(); const button = $('login').querySelector('button'); button.disabled = true;
        try { await api('/api/login','POST',{ password:$('password').value }); $('password').value = ''; await refresh(); showStudio(true); notice(''); }
        catch (error) { notice(error.message); }
        finally { button.disabled = false; }
    });
    $('editor').addEventListener('submit', async event => {
        event.preventDefault(); $('save').disabled = true;
        const id = $('project-id').value;
        const input = { featured:$('featured').checked };
        for (const key of ['name','category','description','url']) input[key] = $(key).value;
        if (photo) input.photo = photo;
        try { await api('/api/projects' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', input); reset(); await refresh(); notice('Project saved. Your portfolio is updated.'); }
        catch (error) { notice(error.message); }
        finally { $('save').disabled = false; }
    });
    $('cancel').addEventListener('click', reset);
    $('logout').addEventListener('click', async () => { try { await api('/api/logout','POST',{}); reset(); projects = []; $('library').replaceChildren(); showStudio(false); notice('Signed out.'); } catch (error) { notice(error.message); } });
    reset();
    api('/api/session').then(async () => { await refresh(); showStudio(true); }).catch(() => {});
})();
