/* Shared public project collection. Content is always inserted as text. */
(async () => {
    const list = document.querySelector('#project-list');
    if (!list) return;
    const status = document.querySelector('#projects-status');
    const featured = !!document.querySelector('.project-slider');
    function element(tag, className, value) {
        const node = document.createElement(tag);
        node.className = className;
        if (value) node.textContent = value;
        return node;
    }
    const dialog = document.createElement('dialog');
    dialog.className = 'project-dialog';
    document.body.append(dialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    function details(project) {
        dialog.replaceChildren();
        const close = element('button', 'dialog-close', 'Close ×');
        close.addEventListener('click', () => dialog.close());
        const image = element('img', 'project-detail-image'); image.src = project.image; image.alt = project.name;
        dialog.append(close, image, element('p', 'project-category', project.category), element('h2', '', project.name), element('p', 'project-description', project.description));
        if (/^https?:\/\//i.test(project.url)) {
            const link = element('a', 'more-projects', 'Visit project ↗');
            link.href = project.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; dialog.append(link);
        }
        dialog.showModal();
    }
    try {
        let response;
        try { response = await fetch('/api/projects', { cache:'no-store' }); if (!response.ok) throw new Error(); }
        catch { response = await fetch('projects.seed.json'); }
        if (!response.ok) throw new Error();
        let projects = await response.json();
        if (featured) projects = projects.filter(p => p.featured).slice(0, 6);
        for (const project of projects) {
            const card = element('article', 'project-card' + (featured ? ' swiper-slide' : ''));
            const button = element('button', 'project-open');
            button.setAttribute('aria-label', 'View ' + project.name);
            const image = element('img', 'project-image'); image.src = project.image; image.alt = project.name; image.loading = 'lazy';
            const info = element('div', 'project-info');
            info.append(element('span', 'project-category', project.category), element('h3', '', project.name), element('span', 'project-arrow', '↗'));
            button.append(image, info); button.addEventListener('click', () => details(project)); card.append(button); list.append(card);
        }
        if (!projects.length) status.textContent = 'New projects are on the way. Check back soon.';
        if (featured && projects.length) new Swiper('.project-slider', {
            slidesPerView:1, spaceBetween:24, watchOverflow:true,
            navigation:{ prevEl:'.project-prev', nextEl:'.project-next' },
            pagination:{ el:'.project-pagination', clickable:true },
            breakpoints:{ 801:{ slidesPerView:2, spaceBetween:32 } }
        });
        if (featured && !projects.length) document.querySelector('.project-controls').hidden = true;
    } catch { status.textContent = 'Projects could not be loaded. Please refresh to try again.'; }
})();
