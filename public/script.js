const API_BASE_URL = 'http://localhost:3000/api';
const state = {
    token: null,
    userId: null,
    username: null,
    currentGroupId: null,
    currentGroupMembers: [],
    selectedMembers: {}
};

const loginView = document.getElementById('login-view');
const registerView = document.getElementById('register-view');
const appView = document.getElementById('app');
const usernameDisplay = document.getElementById('username-display');
const groupsList = document.getElementById('groups-list');
const groupDetailsView = document.getElementById('group-details-view');
const groupNameEl = document.getElementById('group-name');
const expensesList = document.getElementById('expenses-list');
const membersList = document.getElementById('members-list');
const groupSummary = document.getElementById('group-summary');

async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }
    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 401 || response.status === 403) {
                logout();
            }
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        if (response.status === 204) return null;
        return response.json();
    } catch (error) {
        alert(`API Error: ${error.message}`);
        console.error('API Call Failed:', error);
        throw error;
    }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Login failed.');
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('username', data.username);
        initializeApp();
    } catch (error) {
        alert(`Login Error: ${error.message}`);
        console.error('Login failed:', error);
    }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Registration failed.');
        }
        alert('Registration successful! Please log in.');
        showLoginView(e);
    } catch (error) {
        alert(`Registration Error: ${error.message}`);
        console.error('Registration failed:', error);
    }
});

function showRegisterView(event) {
    event.preventDefault();
    loginView.style.display = 'none';
    registerView.style.display = 'flex';
}

function showLoginView(event) {
    event.preventDefault();
    registerView.style.display = 'none';
    loginView.style.display = 'flex';
}

function logout() {
    localStorage.clear();
    state.token = null;
    state.userId = null;
    state.username = null;
    appView.style.display = 'none';
    registerView.style.display = 'none';
    loginView.style.display = 'flex';
}

function initializeApp() {
    state.token = localStorage.getItem('token');
    state.userId = localStorage.getItem('userId');
    state.username = localStorage.getItem('username');

    if (state.token) {
        loginView.style.display = 'none';
        registerView.style.display = 'none';
        appView.style.display = 'block';
        usernameDisplay.textContent = `Welcome, ${state.username}`;
        fetchGroups();
    } else {
        registerView.style.display = 'none';
        loginView.style.display = 'flex';
        appView.style.display = 'none';
    }
}

async function fetchGroups() {
    try {
        const groups = await apiCall('/groups');
        groupsList.innerHTML = '';
        groups.forEach(group => {
            const li = document.createElement('li');
            li.textContent = group.name;
            li.className = 'p-2 rounded cursor-pointer hover:bg-teal-100';
            li.onclick = () => selectGroup(group.id);
            groupsList.appendChild(li);
        });
    } catch (error) {}
}

async function selectGroup(groupId) {
    state.currentGroupId = groupId;
    try {
        const data = await apiCall(`/groups/${groupId}`);
        state.currentGroupMembers = data.members;
        groupNameEl.textContent = data.details.name;
        
        membersList.innerHTML = '';
        data.members.forEach(m => {
            const li = document.createElement('li');
            li.textContent = m.username;
            membersList.appendChild(li);
        });

        expensesList.innerHTML = '';
        data.expenses.forEach(exp => {
            const li = document.createElement('li');
            li.className = 'p-3 bg-gray-50 rounded-lg flex justify-between items-center';
            li.innerHTML = `
                <div>
                    <p class="font-semibold">${exp.description}</p>
                    <p class="text-sm text-gray-500">Paid by ${exp.paid_by_username}</p>
                </div>
                <div class="text-right">
                     <p class="font-bold text-lg">₹${exp.amount}</p>
                     <button onclick="deleteExpense(${exp.id})" class="text-xs text-red-500 hover:underline">Delete</button>
                </div>
            `;
            expensesList.appendChild(li);
        });
        
        groupDetailsView.classList.remove('hidden');
        fetchGroupSummary();
    } catch (error) {}
}

async function fetchGroupSummary() {
    if (!state.currentGroupId) return;
    try {
        const summary = await apiCall(`/groups/${state.currentGroupId}/summary`);
        groupSummary.innerHTML = '';
        if(summary.length === 0) {
            groupSummary.innerHTML = '<p class="text-gray-500">All settled up!</p>';
            return;
        }
        const ul = document.createElement('ul');
        ul.className = 'space-y-1';
        summary.forEach(txn => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="font-semibold">${txn.from}</span> owes <span class="font-semibold">${txn.to}</span> <span class="font-bold text-green-700">₹${txn.amount}</span>`;
            ul.appendChild(li);
        });
        groupSummary.appendChild(ul);
    } catch (error) {}
}

async function deleteGroup() {
    if(!state.currentGroupId || !confirm('Are you sure you want to delete this group? This action cannot be undone.')) return;
    try {
        await apiCall(`/groups/${state.currentGroupId}`, 'DELETE');
        alert('Group deleted.');
        state.currentGroupId = null;
        groupDetailsView.classList.add('hidden');
        fetchGroups();
    } catch(error) {}
}

function showCreateGroupModal() {
    state.selectedMembers = {};
    document.getElementById('create-group-form').reset();
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('selected-members').innerHTML = '';
    openModal('create-group-modal');
}

const memberSearchInput = document.getElementById('member-search');
memberSearchInput.addEventListener('input', async (e) => {
    const searchTerm = e.target.value;
    const searchResultsDiv = document.getElementById('search-results');
    if (searchTerm.length < 2) {
        searchResultsDiv.innerHTML = '';
        return;
    }
    const users = await apiCall(`/users/search?username=${searchTerm}`);
    searchResultsDiv.innerHTML = '';
    users.forEach(user => {
        if (!state.selectedMembers[user.id]) {
            const div = document.createElement('div');
            div.textContent = user.username;
            div.className = 'p-2 cursor-pointer hover:bg-gray-200';
            div.onclick = () => selectMember(user);
            searchResultsDiv.appendChild(div);
        }
    });
});

function selectMember(user) {
    state.selectedMembers[user.id] = user.username;
    memberSearchInput.value = '';
    document.getElementById('search-results').innerHTML = '';
    renderSelectedMembers();
}

function renderSelectedMembers() {
    const selectedMembersDiv = document.getElementById('selected-members');
    selectedMembersDiv.innerHTML = '';
    for (const id in state.selectedMembers) {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-100 p-2 rounded';
        div.textContent = state.selectedMembers[id];
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'x';
        removeBtn.className = 'ml-2 text-red-500';
        removeBtn.onclick = () => {
            delete state.selectedMembers[id];
            renderSelectedMembers();
        };
        div.appendChild(removeBtn);
        selectedMembersDiv.appendChild(div);
    }
}

document.getElementById('create-group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-group-name').value;
    const memberIds = Object.keys(state.selectedMembers).map(id => parseInt(id));
    try {
        await apiCall('/groups', 'POST', { name, members: memberIds });
        closeModal('create-group-modal');
        fetchGroups();
    } catch (error) {}
});

function showAddMemberModal() {
    document.getElementById('add-member-form').reset();
    document.getElementById('add-member-search-results').innerHTML = '';
    openModal('add-member-modal');
}

const addMemberSearchInput = document.getElementById('add-member-search');
addMemberSearchInput.addEventListener('input', async(e) => {
    const searchTerm = e.target.value;
    const resultsDiv = document.getElementById('add-member-search-results');
    if (searchTerm.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }
    const users = await apiCall(`/users/search?username=${searchTerm}`);
    resultsDiv.innerHTML = '';
    const existingMemberIds = state.currentGroupMembers.map(m => m.id);
    users.filter(u => !existingMemberIds.includes(u.id)).forEach(user => {
        const div = document.createElement('div');
        div.textContent = user.username;
        div.className = 'p-2 cursor-pointer hover:bg-gray-200';
        div.onclick = () => selectUserToAdd(user);
        resultsDiv.appendChild(div);
    });
});

let userToAdd = null;
function selectUserToAdd(user) {
    userToAdd = user;
    addMemberSearchInput.value = user.username;
    document.getElementById('add-member-search-results').innerHTML = '';
}

document.getElementById('add-member-form').addEventListener('submit', async(e) => {
    e.preventDefault();
    if(!userToAdd) {
        alert("Please select a user to add.");
        return;
    }
    try {
        await apiCall(`/groups/${state.currentGroupId}/members`, 'POST', { userId: userToAdd.id });
        closeModal('add-member-modal');
        selectGroup(state.currentGroupId);
        userToAdd = null;
    } catch(err) {}
});

function showAddExpenseModal() {
    document.getElementById('add-expense-form').reset();
    const paidBySelect = document.getElementById('expense-paid-by');
    const splitBetweenDiv = document.getElementById('expense-split-between');
    paidBySelect.innerHTML = '';
    splitBetweenDiv.innerHTML = '';

    state.currentGroupMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = member.username;
        paidBySelect.appendChild(option);

        const div = document.createElement('div');
        div.className = 'flex justify-between items-center';
        div.innerHTML = `
            <div>
                <input type="checkbox" id="split-user-${member.id}" data-userid="${member.id}" class="split-checkbox mr-2" checked>
                <label for="split-user-${member.id}">${member.username}</label>
            </div>
            <input type="number" data-userid="${member.id}" class="split-amount-input w-24 p-1 border rounded" placeholder="0.00" step="0.01">
        `;
        splitBetweenDiv.appendChild(div);
    });
    openModal('add-expense-modal');
}

function splitEqually() {
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const checkboxes = document.querySelectorAll('.split-checkbox:checked');
    if (isNaN(amount) || amount <= 0 || checkboxes.length === 0) {
        alert('Please enter a valid amount and select members to split with.');
        return;
    }
    const splitAmount = (amount / checkboxes.length).toFixed(2);
    document.querySelectorAll('.split-amount-input').forEach(input => {
        const userId = input.dataset.userid;
        const userCheckbox = document.getElementById(`split-user-${userId}`);
        if (userCheckbox.checked) {
            input.value = splitAmount;
        } else {
            input.value = '';
        }
    });
}

document.getElementById('add-expense-form').addEventListener('submit', async(e) => {
    e.preventDefault();
    const description = document.getElementById('expense-description').value;
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const paidByUserId = parseInt(document.getElementById('expense-paid-by').value);

    const splits = [];
    let totalSplit = 0;
    document.querySelectorAll('.split-checkbox:checked').forEach(cb => {
        const userId = parseInt(cb.dataset.userid);
        const amountOwedInput = document.querySelector(`.split-amount-input[data-userid="${userId}"]`);
        const amountOwed = parseFloat(amountOwedInput.value);

        if(isNaN(amountOwed) || amountOwed <= 0) {
            return;
        }
        splits.push({ userId, amountOwed });
        totalSplit += amountOwed;
    });

    if (Math.abs(totalSplit - amount) > 0.01) {
        alert('The split amounts must add up to the total expense amount.');
        return;
    }
    if (splits.length === 0) {
        alert('You must select at least one person to split the expense with.');
        return;
    }

    try {
        await apiCall('/expenses', 'POST', {
            groupId: state.currentGroupId,
            description,
            amount,
            paidByUserId,
            splits
        });
        closeModal('add-expense-modal');
        selectGroup(state.currentGroupId);
    } catch (err) {}
});

async function deleteExpense(expenseId) {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
        await apiCall(`/expenses/${expenseId}`, 'DELETE');
        selectGroup(state.currentGroupId);
    } catch (err) {}
}

function showSettleUpModal() {
    document.getElementById('settle-up-form').reset();
    const payerSelect = document.getElementById('settle-payer');
    const payeeSelect = document.getElementById('settle-payee');
    payerSelect.innerHTML = '';
    payeeSelect.innerHTML = '';
    
    state.currentGroupMembers.forEach(member => {
        const option1 = document.createElement('option');
        option1.value = member.id;
        option1.textContent = member.username;
        payerSelect.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = member.id;
        option2.textContent = member.username;
        payeeSelect.appendChild(option2);
    });
    openModal('settle-up-modal');
}

document.getElementById('settle-up-form').addEventListener('submit', async(e) => {
    e.preventDefault();
    const payerId = parseInt(document.getElementById('settle-payer').value);
    const payeeId = parseInt(document.getElementById('settle-payee').value);
    const amount = parseFloat(document.getElementById('settle-amount').value);

    if(payerId === payeeId) {
        alert("Payer and payee cannot be the same person.");
        return;
    }
    if(isNaN(amount) || amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }
    try {
        await apiCall('/settle', 'POST', {
            groupId: state.currentGroupId,
            payerId,
            payeeId,
            amount
        });
        closeModal('settle-up-modal');
        selectGroup(state.currentGroupId);
    } catch(err) {}
});

function openModal(modalId) { document.getElementById(modalId).classList.add('active'); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }

initializeApp();
