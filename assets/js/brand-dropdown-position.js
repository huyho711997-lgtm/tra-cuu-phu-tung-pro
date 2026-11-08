(function () {
    const trigger = document.getElementById('btnHang');
    const menu = document.getElementById('dropdownHang');
    if (!trigger || !menu) return;

    // Flowbite 2.3 uses Popper's flip modifier by default, which opens upwards.
    trigger.addEventListener('click', function () {
        const instances = window.FlowbiteInstances;
        if (!instances?.instanceExists('Dropdown', 'dropdownHang')) return;
        const dropdown = instances.getInstance('Dropdown', 'dropdownHang');
        const popper = dropdown?._popperInstance;
        if (!popper || dropdown.isVisible()) return;
        popper.setOptions(options => ({
            ...options,
            placement: 'bottom-start',
            modifiers: [...options.modifiers.filter(modifier => modifier.name !== 'flip'), {name:'flip',enabled:false}]
        }));
        requestAnimationFrame(() => {
            if (!dropdown.isVisible()) return;
            popper.update().then(() => {
                if (dropdown.isVisible() && menu.getBoundingClientRect().bottom > window.innerHeight - 8) {
                    menu.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
                }
            });
        });
    }, true);
})();
