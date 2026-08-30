/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Public Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: '#7367F0',
        'primary-dark': '#5f50ee',
        'primary-light': '#EDE9FF',
        secondary: '#A8AAAE',
        success: '#28C76F',
        'success-light': '#DFF7EC',
        danger: '#EA5455',
        'danger-light': '#FCEAEA',
        warning: '#FF9F43',
        'warning-light': '#FFF3E4',
        info: '#00CFE8',
        'info-light': '#E0F9FB',
        // Layout
        body: '#F8F7FA',
        'body-dark': '#25293C',
        // Sidebar (semi-dark)
        sidebar: '#2F3349',
        'sidebar-hover': '#363B54',
        'sidebar-text': '#CFD3EC',
        'sidebar-text-active': '#FFFFFF',
        // Cards / surfaces
        surface: '#FFFFFF',
        'surface-dark': '#2F3349',
        // Text
        'text-heading': '#444050',
        text: '#6D6777',
        'text-muted': '#A8AAAE',
        // Borders
        border: '#DBDADE',
        'border-dark': '#3D4060',
      },
      borderRadius: {
        'card': '0.375rem',
      },
      boxShadow: {
        card: '0 2px 6px 0 rgba(67,89,113,.12)',
        modal: '0 4px 25px 0 rgba(0,0,0,.1)',
      },
    },
  },
  plugins: [],
}
