from aiogram.fsm.state import State, StatesGroup


class ContactStates(StatesGroup):
    waiting_value = State()
