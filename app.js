document.addEventListener('DOMContentLoaded', () => {
  const sidebarItems = document.querySelectorAll('.sidebar-item');

  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      // Active state
      sidebarItems.forEach(btn => btn.classList.remove('active'));
      item.classList.add('active');
    });

    // Track mouse position for soft light highlight
    item.addEventListener('mousemove', e => {
      const rect = item.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      item.style.setProperty('--x', `${x}px`);
      item.style.setProperty('--y', `${y}px`);
    });
  });
});
